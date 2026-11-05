#!/usr/bin/env bash
# Build the release archive testers install with install.sh (Ceetrix story 6).
#
#   scripts/build-release.sh <version>        build dist/local-ai-coach.tar.gz and .sha256
#   scripts/build-release.sh --check-tree DIR refuse if DIR holds a native module or an env file
#
# The archive is the same for every machine: the Next standalone server (plain
# JavaScript once sharp is removed), the agent source with its uv.lock, the
# curriculum and the launcher. install.sh fetches Node and uv for each machine.
set -euo pipefail

ARCHIVE=local-ai-coach.tar.gz

# Files that must never ship: native modules tie the archive to one machine, and
# env files may hold keys. .env.example is a template with no values.
check_tree() {
  local dir="$1" bad
  bad="$(find "$dir" \( -name '*.node' -o \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' \) -print | head -n 5)"
  if [ -n "$bad" ]; then
    echo "build-release: refusing, the release would ship these files:" >&2
    echo "$bad" >&2
    return 1
  fi
}

if [ "${1:-}" = "--check-tree" ]; then
  check_tree "${2:?usage: build-release.sh --check-tree DIR}"
  exit $?
fi

VERSION="${1:?usage: build-release.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
OUT="$DIST/release"
STANDALONE="$ROOT/apps/app/.next/standalone"

echo "Building the stub coach app ($VERSION)"
(cd "$ROOT/apps/app" && NEXT_PUBLIC_COACH_STUB=1 pnpm build >/dev/null)

rm -rf "$OUT" "$DIST/$ARCHIVE" "$DIST/$ARCHIVE.sha256"
mkdir -p "$OUT/bin" "$OUT/apps"

# The Next server, its static files and public folder (next start serves these;
# the standalone server needs them copied in beside it).
cp -a "$STANDALONE" "$OUT/server"
cp -a "$ROOT/apps/app/.next/static" "$OUT/server/apps/app/.next/static"
if [ -d "$ROOT/apps/app/public" ]; then cp -a "$ROOT/apps/app/public" "$OUT/server/apps/app/public"; fi

# sharp is traced by Next but never loaded (images are unoptimised); drop it and
# any link left pointing at it.
rm -rf "$OUT"/server/node_modules/.pnpm/sharp@* "$OUT"/server/node_modules/.pnpm/@img+sharp*
find "$OUT/server" -type l ! -exec test -e {} \; -delete

# The agent, without its virtualenv, tests or caches; uv rebuilds the env from uv.lock.
rsync -a \
  --exclude '.venv' --exclude 'tests' --exclude '__pycache__' --exclude '.pytest_cache' \
  --exclude '.DS_Store' --exclude '.claude' --exclude '.env' --exclude '.env.*' \
  "$ROOT/apps/agent" "$OUT/apps/"
rsync -a --exclude '__pycache__' --exclude '.DS_Store' "$ROOT/curriculum" "$OUT/"

cp "$ROOT/scripts/local-ai-coach" "$OUT/bin/local-ai-coach"
chmod +x "$OUT/bin/local-ai-coach"
echo "$VERSION" > "$OUT/VERSION"

check_tree "$OUT"

# COPYFILE_DISABLE stops macOS tar adding ._ metadata files.
COPYFILE_DISABLE=1 tar -czf "$DIST/$ARCHIVE" -C "$OUT" .
(cd "$DIST" && shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256")
echo "Built $DIST/$ARCHIVE ($(du -h "$DIST/$ARCHIVE" | cut -f1))"
cat "$DIST/$ARCHIVE.sha256"

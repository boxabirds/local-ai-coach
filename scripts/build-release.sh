#!/usr/bin/env bash
# Build the release archive testers install with install.sh (Ceetrix story 6).
#
#   scripts/build-release.sh <version>        build dist/local-ai-coach-<platform>.tar.gz and .sha256 for each platform
#   scripts/build-release.sh --check-tree DIR refuse if DIR holds a native module or an env file
#
# One archive per kind of computer (story 31): the page's server compiled by Bun
# into one executable for that computer, the built page, the agent source with its
# uv.lock, the curriculum and the launcher. install.sh fetches uv for the machine.
# COACH_RELEASE_PLATFORMS limits the platforms (the release test builds this
# machine's only, so it downloads one Bun runtime, not four).
set -euo pipefail

PLATFORMS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64)

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
APP="$ROOT/apps/app"
read -r -a platforms <<< "${COACH_RELEASE_PLATFORMS:-${PLATFORMS[*]}}"
BUN=(pnpm --dir "$APP" exec bun)

echo "Building the stub coach's page ($VERSION)"
WEB="$DIST/web"
rm -rf "$DIST"
mkdir -p "$DIST"
(cd "$APP" && COACH_STUB=1 COACH_WEB_OUT="$WEB" pnpm exec bun build.ts >/dev/null)
# Source maps help development only.
find "$WEB" -name '*.map' -delete

for platform in "${platforms[@]}"; do
  case " ${PLATFORMS[*]} " in *" $platform "*) ;; *) echo "build-release: unknown platform $platform" >&2; exit 1 ;; esac
  archive="local-ai-coach-$platform.tar.gz"
  out="$DIST/release-$platform"
  echo "Building $archive"
  mkdir -p "$out/bin" "$out/apps"

  # The page's server, compiled with the Bun runtime for this platform.
  "${BUN[@]}" build --compile --minify --target="bun-$platform" "$APP/server.ts" --outfile "$out/bin/coach-web" >/dev/null
  cp -a "$WEB" "$out/web"

  # The agent, without its virtualenv, tests or caches; uv rebuilds the env from uv.lock.
  rsync -a \
    --exclude '.venv' --exclude 'tests' --exclude '__pycache__' --exclude '.pytest_cache' \
    --exclude '.DS_Store' --exclude '.claude' --exclude '.env' --exclude '.env.*' \
    "$ROOT/apps/agent" "$out/apps/"
  rsync -a --exclude '__pycache__' --exclude '.DS_Store' "$ROOT/curriculum" "$out/"

  cp "$ROOT/scripts/local-ai-coach" "$out/bin/local-ai-coach"
  chmod +x "$out/bin/local-ai-coach"
  echo "$VERSION" > "$out/VERSION"

  check_tree "$out"

  # COPYFILE_DISABLE stops macOS tar adding ._ metadata files.
  COPYFILE_DISABLE=1 tar -czf "$DIST/$archive" -C "$out" .
  (cd "$DIST" && shasum -a 256 "$archive" > "$archive.sha256")
  echo "Built $DIST/$archive ($(du -h "$DIST/$archive" | cut -f1))"
done

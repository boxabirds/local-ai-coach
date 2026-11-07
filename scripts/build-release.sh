#!/usr/bin/env bash
# Build the release archive testers install with install.sh (Ceetrix story 6).
#
#   scripts/build-release.sh <version>        build dist/local-ai-coach-<platform>.tar.gz and .sha256 for each platform
#   scripts/build-release.sh --check-tree DIR refuse if DIR holds a native module or an env file
#   scripts/build-release.sh --fetch-pinned URL FILE SHA256   fetch one build input as the build does
#   scripts/build-release.sh --fresh-dist DIR                 empty DIR as the build does
#
# One archive per kind of computer (story 31): the page's server compiled by Bun
# into one executable for that computer, the built page, the agent source, the
# curriculum and the launcher. Story 32: the agent's Python comes too, ready to
# run: a pinned portable CPython with the agent's locked packages installed for
# that computer and its bytecode compiled, so installing downloads nothing else.
# COACH_RELEASE_PLATFORMS limits the platforms (the release test builds this
# machine's only).
#
# Build inputs are pinned here with their SHA-256 and checked before use:
#   COACH_RELEASE_CACHE  where downloads are kept (default ~/.cache/local-ai-coach-release)
#   COACH_PYTHON_BASE    python-build-standalone's download site (tests use a fake)
#   COACH_UV_BASE        uv's download site (tests use a fake)
set -euo pipefail

PLATFORMS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64)

# CPython for the agent: python-build-standalone, the same builds uv installs.
PYTHON_BUILD=20261026
PYTHON_VERSION=3.12.16
PYTHON_MINOR=3.12
python_sha() {
  case "$1" in
    aarch64-apple-darwin) echo 353d5f1b4fd2715e7053f12f068435d5bbad16b91e057006b5d01e0925709a7e ;;
    x86_64-apple-darwin) echo 37c38fda76fec1fbf310adcbafb7f0d96af13b5511bf8ea954c3aa8eec185734 ;;
    x86_64-unknown-linux-gnu) echo ce4f6d0a6cfdb3bed6e44c2f9affd85943c76a42e25ad3a259002f31d6fb8a20 ;;
    aarch64-unknown-linux-gnu) echo bb4b6392670c5d3f93876996fcaa19858a4a413a0c7720144c18b0d6f1f0db2d ;;
  esac
}
# uv, on the build machine only: it reads the lock and installs the packages.
UV_VERSION=0.13.7
uv_sha() {
  case "$1" in
    aarch64-apple-darwin) echo 81b811b57e4624df7ed3aac148e0359100d9962f3d9dce00aec533dc2e086731 ;;
    x86_64-apple-darwin) echo 20c47e4c1f630b8abaff8c291fa9b9aa300fef92c4fbff95adf198b55287cda7 ;;
    x86_64-unknown-linux-gnu) echo c5221ff41b7892bfc223543883600125f6a47fe845093e0f5bdff4f359196d83 ;;
    aarch64-unknown-linux-gnu) echo 71279f8d3c67241e807b9d8db872d1bf541579fb9f08b7d1eb1682196d1e57dc ;;
  esac
}

triple() {
  case "$1" in
    darwin-arm64) echo aarch64-apple-darwin ;;
    darwin-x64) echo x86_64-apple-darwin ;;
    linux-x64) echo x86_64-unknown-linux-gnu ;;
    linux-arm64) echo aarch64-unknown-linux-gnu ;;
  esac
}

host_platform() {
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64) echo darwin-arm64 ;;
    Darwin/x86_64) echo darwin-x64 ;;
    Linux/x86_64) echo linux-x64 ;;
    Linux/aarch64 | Linux/arm64) echo linux-arm64 ;;
    *) echo "build-release: this machine ($(uname -s) on $(uname -m)) cannot build the release" >&2; return 1 ;;
  esac
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d ' ' -f 1; else sha256sum "$1" | cut -d ' ' -f 1; fi
}

fetch_pinned() {
  # fetch_pinned URL FILE SHA256: reuse FILE if it matches, else download it; stop on a mismatch.
  local url="$1" file="$2" want="$3"
  if [ -f "$file" ] && [ "$(sha256_of "$file")" = "$want" ]; then return 0; fi
  rm -f "$file"
  curl -fsSL --retry 2 -o "$file.part" "$url" || { echo "build-release: could not download $url" >&2; rm -f "$file.part"; return 1; }
  if [ "$(sha256_of "$file.part")" != "$want" ]; then
    rm -f "$file.part"
    echo "build-release: $(basename "$file") could not be verified (its fingerprint does not match the pinned one)" >&2
    return 1
  fi
  mv "$file.part" "$file"
}

fresh_dist() {
  # fresh_dist DIR: an empty DIR, whatever was in it. The old one is moved aside first and
  # deleted as far as possible: Finder writes .DS_Store into a folder it is showing, which
  # can make rm -rf fail half way with "Directory not empty". Leftovers (.dist-old.*, ignored
  # by git) are removed by the build after this one.
  local old
  old="$(dirname "$1")/.dist-old"
  rm -rf "$old".* 2>/dev/null || true
  if [ -e "$1" ]; then mv "$1" "$old.$$"; fi
  rm -rf "$old.$$" 2>/dev/null || true
  mkdir -p "$1"
}

python_file() { echo "cpython-$PYTHON_VERSION+$PYTHON_BUILD-$1-install_only_stripped.tar.gz"; }

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
if [ "${1:-}" = "--fresh-dist" ]; then
  fresh_dist "${2:?usage: build-release.sh --fresh-dist DIR}"
  exit $?
fi
if [ "${1:-}" = "--fetch-pinned" ]; then
  fetch_pinned "${2:?usage: build-release.sh --fetch-pinned URL FILE SHA256}" "${3:?}" "${4:?}"
  exit $?
fi

VERSION="${1:?usage: build-release.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
APP="$ROOT/apps/app"
AGENT="$ROOT/apps/agent"
read -r -a platforms <<< "${COACH_RELEASE_PLATFORMS:-${PLATFORMS[*]}}"
BUN=(pnpm --dir "$APP" exec bun)
CACHE="${COACH_RELEASE_CACHE:-$HOME/.cache/local-ai-coach-release}"
PYTHON_BASE="${COACH_PYTHON_BASE:-https://github.com/astral-sh/python-build-standalone/releases/download}"
UV_BASE="${COACH_UV_BASE:-https://github.com/astral-sh/uv/releases/download}"

for platform in "${platforms[@]}"; do
  case " ${PLATFORMS[*]} " in *" $platform "*) ;; *) echo "build-release: unknown platform $platform" >&2; exit 1 ;; esac
done

# ---------------------------------------------------------------- build inputs, checked first
# Every download is checked against its pinned fingerprint before anything is built.
HOST="$(host_platform)"
HOST_TRIPLE="$(triple "$HOST")"
mkdir -p "$CACHE"
echo "Fetching the build inputs (CPython $PYTHON_VERSION, uv $UV_VERSION)"
uv_file="uv-$HOST_TRIPLE.tar.gz"
fetch_pinned "$UV_BASE/$UV_VERSION/$uv_file" "$CACHE/$uv_file" "$(uv_sha "$HOST_TRIPLE")"
# The build machine's own CPython compiles the bytecode: it must be the same Python version.
needed="$HOST_TRIPLE"
for platform in "${platforms[@]}"; do needed="$needed $(triple "$platform")"; done
for target in $(printf '%s\n' $needed | sort -u); do
  pfile="$(python_file "$target")"
  # The "+" in the file name is %2B in the download address.
  fetch_pinned "$PYTHON_BASE/$PYTHON_BUILD/${pfile//+/%2B}" "$CACHE/$pfile" "$(python_sha "$target")"
done

TOOLS="$(mktemp -d "${TMPDIR:-/tmp}/coach-release-tools.XXXXXX")"
trap 'rm -rf "$TOOLS"' EXIT
mkdir -p "$TOOLS/uv" "$TOOLS/host"
tar -xzf "$CACHE/$uv_file" -C "$TOOLS/uv" --strip-components 1
tar -xzf "$CACHE/$(python_file "$HOST_TRIPLE")" -C "$TOOLS/host"
UV="$TOOLS/uv/uv"
HOST_PY="$TOOLS/host/python/bin/python3"
# The agent's packages exactly as locked, each with its hashes; the agent itself is source.
(cd "$AGENT" && "$UV" export --frozen --no-dev --no-emit-project --format requirements-txt --quiet -o "$TOOLS/requirements.txt")

echo "Building the stub coach's page ($VERSION)"
WEB="$DIST/web"
fresh_dist "$DIST"
(cd "$APP" && COACH_STUB=1 COACH_WEB_OUT="$WEB" pnpm exec bun build.ts >/dev/null)
# Source maps help development only.
find "$WEB" -name '*.map' -delete

for platform in "${platforms[@]}"; do
  archive="local-ai-coach-$platform.tar.gz"
  out="$DIST/release-$platform"
  echo "Building $archive"
  mkdir -p "$out/bin" "$out/apps"

  # The page's server, compiled with the Bun runtime for this platform.
  "${BUN[@]}" build --compile --minify --target="bun-$platform" "$APP/server.ts" --outfile "$out/bin/coach-web" >/dev/null
  cp -a "$WEB" "$out/web"

  # The agent, without its virtualenv, tests or caches.
  rsync -a \
    --exclude '.venv' --exclude 'tests' --exclude 'evals' --exclude '__pycache__' --exclude '.pytest_cache' \
    --exclude '.DS_Store' --exclude '.claude' --exclude '.env' --exclude '.env.*' \
    "$AGENT" "$out/apps/"

  # Its Python, for this platform: CPython plus the locked packages' wheels built for it.
  target="$(triple "$platform")"
  tar -xzf "$CACHE/$(python_file "$target")" -C "$out"
  "$UV" pip install --quiet --target "$out/python/lib/python$PYTHON_MINOR/site-packages" \
    --python-platform "$target" --python-version "$PYTHON_MINOR" \
    --only-binary :all: --require-hashes --no-deps --cache-dir "$CACHE/uv-cache" -r "$TOOLS/requirements.txt"
  # Bytecode, so the first start is quick and nothing is written into the install.
  "$HOST_PY" -I -m compileall -q -j 0 "$out/python/lib/python$PYTHON_MINOR/site-packages" "$out/apps/agent" >/dev/null
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

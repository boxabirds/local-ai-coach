#!/bin/sh
# Install the Mastering Local AI coach on this computer (Ceetrix story 6).
#
#   curl -fsSL https://github.com/boxabirds/local-ai-coach/releases/latest/download/install.sh | sh
#
# Installs into ~/.local-ai-coach/app (a link to this version's own folder; no
# administrator password, no Homebrew, no git) and links ~/.local/bin/local-ai-coach. Every download is checked
# against its published SHA-256 before anything is changed. Run it again to
# update; your progress in ~/.local-ai-coach is kept.
#
#   sh install.sh --plan   print what would be downloaded for this computer, then stop
set -eu

NODE_VERSION=24.22.2
UV_VERSION=0.13.7
RELEASE_BASE="${COACH_RELEASE_BASE:-https://github.com/boxabirds/local-ai-coach/releases/latest/download}"
NODE_BASE="${COACH_NODE_BASE:-https://nodejs.org/dist}"
UV_BASE="${COACH_UV_BASE:-https://github.com/astral-sh/uv/releases/download}"
ARCHIVE=local-ai-coach.tar.gz

COACH_ROOT="$HOME/.local-ai-coach"
APP="$COACH_ROOT/app"
BIN_DIR="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- this computer

os="$(uname -s)"
cpu="$(uname -m)"
case "$os/$cpu" in
  Darwin/arm64) node_platform=darwin-arm64; uv_target=aarch64-apple-darwin ;;
  Darwin/x86_64) node_platform=darwin-x64; uv_target=x86_64-apple-darwin ;;
  Linux/x86_64) node_platform=linux-x64; uv_target=x86_64-unknown-linux-gnu ;;
  Linux/aarch64 | Linux/arm64) node_platform=linux-arm64; uv_target=aarch64-unknown-linux-gnu ;;
  *) fail "this computer ($os on $cpu) is not supported. The coach runs on macOS (Apple silicon or Intel) and Linux (x86_64 or arm64)." ;;
esac

node_file="node-v$NODE_VERSION-$node_platform.tar.gz"
uv_file="uv-$uv_target.tar.gz"

if [ "${1:-}" = "--plan" ]; then
  say "release $RELEASE_BASE/$ARCHIVE"
  say "node $NODE_BASE/v$NODE_VERSION/$node_file"
  say "uv $UV_BASE/$UV_VERSION/$uv_file"
  exit 0
fi

command -v curl >/dev/null 2>&1 || fail "curl is needed and was not found."
command -v tar >/dev/null 2>&1 || fail "tar is needed and was not found."
if command -v shasum >/dev/null 2>&1; then sha256() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
elif command -v sha256sum >/dev/null 2>&1; then sha256() { sha256sum "$1" | cut -d ' ' -f 1; }
else fail "shasum or sha256sum is needed and was not found."; fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/local-ai-coach-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

fetch() {
  # fetch URL FILE: download, or stop naming what failed.
  curl -fsSL --retry 2 -o "$2" "$1" || fail "could not download $1. Check your internet connection and try again; nothing was changed."
}

verify() {
  # verify FILE EXPECTED_SHA256 NAME
  actual="$(sha256 "$1")"
  [ -n "$2" ] && [ "$actual" = "$2" ] || fail "$3 could not be verified (its fingerprint does not match), so nothing was installed."
}

# ---------------------------------------------------------------- download and check

say "Downloading the coach"
fetch "$RELEASE_BASE/$ARCHIVE" "$WORK/$ARCHIVE"
fetch "$RELEASE_BASE/$ARCHIVE.sha256" "$WORK/$ARCHIVE.sha256"
verify "$WORK/$ARCHIVE" "$(cut -d ' ' -f 1 "$WORK/$ARCHIVE.sha256")" "$ARCHIVE"

say "Downloading Node $NODE_VERSION"
fetch "$NODE_BASE/v$NODE_VERSION/$node_file" "$WORK/$node_file"
fetch "$NODE_BASE/v$NODE_VERSION/SHASUMS256.txt" "$WORK/node.sums"
verify "$WORK/$node_file" "$(grep " $node_file\$" "$WORK/node.sums" | cut -d ' ' -f 1)" "$node_file"

say "Downloading uv $UV_VERSION"
fetch "$UV_BASE/$UV_VERSION/$uv_file" "$WORK/$uv_file"
fetch "$UV_BASE/$UV_VERSION/$uv_file.sha256" "$WORK/uv.sha256"
verify "$WORK/$uv_file" "$(cut -d ' ' -f 1 "$WORK/uv.sha256")" "$uv_file"

# ---------------------------------------------------------------- assemble beside the old install
# Each install gets its own folder for good: Python's environment records absolute
# paths, so the folder must never be renamed after it is set up. The app link is
# switched to it only once everything worked.

mkdir -p "$COACH_ROOT"
NEW="$(mktemp -d "$COACH_ROOT/app-XXXXXX")"
mkdir -p "$NEW/release" "$NEW/node" "$NEW/uv"
tar -xzf "$WORK/$ARCHIVE" -C "$NEW/release"
tar -xzf "$WORK/$node_file" -C "$NEW/node" --strip-components 1
tar -xzf "$WORK/$uv_file" -C "$NEW/uv" --strip-components 1

say "Preparing the coach's agent (Python and its packages; the first time takes a minute)"
if ! (cd "$NEW/release/apps/agent" && UV_PYTHON_INSTALL_DIR="$COACH_ROOT/python" "$NEW/uv/uv" sync --frozen --no-dev --quiet); then
  rm -rf "$NEW"
  fail "setting up the coach's agent failed (see the messages above). Any earlier install was kept."
fi

# ---------------------------------------------------------------- switch the link and tidy

old_target=""
if [ -L "$APP" ]; then old_target="$(readlink "$APP")"; elif [ -e "$APP" ]; then rm -rf "$APP"; fi
# ln -n replaces the link itself (mv onto a link to a folder would move into that folder).
ln -sfn "$NEW" "$APP"
for dir in "$COACH_ROOT"/app-*; do
  [ "$dir" = "$NEW" ] || rm -rf "$dir"
done
[ -n "$old_target" ] && [ "$old_target" != "$NEW" ] && rm -rf "$old_target" 2>/dev/null || true
mkdir -p "$BIN_DIR"
ln -sf "$APP/release/bin/local-ai-coach" "$BIN_DIR/local-ai-coach"

say ""
say "Installed version $(cat "$APP/release/VERSION")."
case ":$PATH:" in
  *":$BIN_DIR:"*) say "Start it with: local-ai-coach" ;;
  *)
    say "Start it with: $BIN_DIR/local-ai-coach"
    say "(To type just local-ai-coach, add this line to your shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\")"
    ;;
esac

#!/bin/sh
# Install the Mastering Local AI coach on this computer (Ceetrix story 6).
#
#   curl -fsSL https://github.com/boxabirds/local-ai-coach/releases/latest/download/install.sh | sh
#
# Installs into ~/.local-ai-coach/app (a link to this version's own folder; no
# administrator password, no Homebrew, no git) and links ~/.local/bin/local-ai-coach. Every download is checked
# against its published SHA-256 before anything is changed. Run it again to
# update; your progress in ~/.local-ai-coach is kept. The archive holds the whole
# coach, its Python included (story 32), so nothing else is downloaded.
#
#   sh install.sh --plan   print what would be downloaded for this computer, then stop
set -eu

RELEASE_BASE="${COACH_RELEASE_BASE:-https://github.com/boxabirds/local-ai-coach/releases/latest/download}"

COACH_ROOT="$HOME/.local-ai-coach"
APP="$COACH_ROOT/app"
BIN_DIR="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- this computer

os="$(uname -s)"
cpu="$(uname -m)"
case "$os/$cpu" in
  Darwin/arm64) platform=darwin-arm64 ;;
  Darwin/x86_64) platform=darwin-x64 ;;
  Linux/x86_64) platform=linux-x64 ;;
  Linux/aarch64 | Linux/arm64) platform=linux-arm64 ;;
  *) fail "this computer ($os on $cpu) is not supported. The coach runs on macOS (Apple silicon or Intel) and Linux (x86_64 or arm64)." ;;
esac

# One archive per kind of computer: the page's server and the agent's Python are built for it.
ARCHIVE="local-ai-coach-$platform.tar.gz"

if [ "${1:-}" = "--plan" ]; then
  say "release $RELEASE_BASE/$ARCHIVE"
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

# ---------------------------------------------------------------- assemble beside the old install
# Each install gets its own folder, and the app link is switched to it only once
# everything worked, so a failed install never breaks the one before it.

mkdir -p "$COACH_ROOT"
NEW="$(mktemp -d "$COACH_ROOT/app-XXXXXX")"
mkdir -p "$NEW/release"
tar -xzf "$WORK/$ARCHIVE" -C "$NEW/release"

# The agent's Python is built for this kind of computer; check this one runs it
# (an older Linux, for example, may not). Importing the agent writes nothing. Its messages
# (libraries print warnings on import) are shown only if the check fails.
say "Checking the coach runs on this computer"
if ! (cd "$NEW/release/apps/agent" && "$NEW/release/python/bin/python3" -I -B -W ignore -c 'import sys; sys.path.insert(0, "."); import main') > "$WORK/agent-check.log" 2>&1; then
  cat "$WORK/agent-check.log" >&2
  rm -rf "$NEW"
  fail "the coach's agent could not run on this computer (see the messages above). Any earlier install was kept."
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
# Installs before story 32 kept a Python of their own here; the archive carries it now.
rm -rf "$COACH_ROOT/python"
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

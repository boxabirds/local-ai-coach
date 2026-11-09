# Shared by scripts/sparkle-key.sh and scripts/make-appcast.sh (Ceetrix story 39). Sourced, not run.
#
# The update key is an Ed25519 private key in the form Sparkle's sign_update reads with
# --ed-key-file: the 32-byte seed in base64. Its public half, also base64, goes into the app's
# Info.plist as SUPublicEDKey and is committed in apps/mac/sparkle-public-key.

SPARKLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPARKLE_KEY_FILE="${SPARKLE_KEY_FILE:-$HOME/.config/local-ai-coach/sparkle_ed25519}"
SPARKLE_PUBLIC_KEY_FILE="${COACH_SPARKLE_PUBLIC_KEY:-$SPARKLE_ROOT/apps/mac/sparkle-public-key}"
# The DER header of an Ed25519 private key (RFC 8410) that precedes the 32-byte seed.
ED25519_PRIVATE_DER_HEADER=302e020100300506032b657004220420
ED25519_RAW_BYTES=32

# Prints the base64 public key of the private key file $1, or fails.
sparkle_public_key_of() {
  local seed
  seed="$(base64 -d <"$1" 2>/dev/null | xxd -p | tr -d '\n')" || return 1
  [ "${#seed}" -eq $((ED25519_RAW_BYTES * 2)) ] || return 1
  printf '%s%s' "$ED25519_PRIVATE_DER_HEADER" "$seed" | xxd -r -p |
    openssl pkey -inform DER -pubout -outform DER 2>/dev/null | tail -c "$ED25519_RAW_BYTES" | base64
}

# Fails, naming the file, unless the private key exists and matches the committed public key.
sparkle_check_key() {
  [ -f "$SPARKLE_KEY_FILE" ] || { echo "no update key at $SPARKLE_KEY_FILE. Make it once with scripts/sparkle-key.sh, or set SPARKLE_KEY_FILE." >&2; return 1; }
  [ -f "$SPARKLE_PUBLIC_KEY_FILE" ] || { echo "no public update key at $SPARKLE_PUBLIC_KEY_FILE. scripts/sparkle-key.sh writes it." >&2; return 1; }
  local derived
  derived="$(sparkle_public_key_of "$SPARKLE_KEY_FILE")" || { echo "$SPARKLE_KEY_FILE is not an Ed25519 key in Sparkle's form" >&2; return 1; }
  [ "$derived" = "$(tr -d '[:space:]' <"$SPARKLE_PUBLIC_KEY_FILE")" ] || { echo "the update key at $SPARKLE_KEY_FILE doesn't match $SPARKLE_PUBLIC_KEY_FILE: testers' apps would refuse every update signed with it" >&2; return 1; }
}

# Prints the path of Sparkle's sign_update, fetching the pinned package if it isn't there yet.
sparkle_tool() {
  local tool="$SPARKLE_ROOT/apps/mac/.build/artifacts/sparkle/Sparkle/bin/$1"
  [ -x "$tool" ] || swift package resolve --package-path "$SPARKLE_ROOT/apps/mac" >/dev/null || return 1
  [ -x "$tool" ] || { echo "no $1 in the Sparkle package" >&2; return 1; }
  printf '%s\n' "$tool"
}

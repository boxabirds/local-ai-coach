#!/usr/bin/env bash
# Make the update key, once (Ceetrix story 39). Julian runs this himself; nothing else does.
#
#   scripts/sparkle-key.sh
#
# Writes the private key to $SPARKLE_KEY_FILE (default ~/.config/local-ai-coach/sparkle_ed25519,
# mode 0600) and its public half to apps/mac/sparkle-public-key, which is committed. Whoever
# holds the private key can ship code to every tester's Mac, and losing it means testers must
# download the next version by hand: keep a copy in your password manager.
# Refuses to replace a key that exists.
set -euo pipefail
source "$(dirname "$0")/sparkle-lib.sh"

[ ! -e "$SPARKLE_KEY_FILE" ] || { echo "sparkle-key: $SPARKLE_KEY_FILE exists; not replacing it. Testers' apps trust that key." >&2; exit 1; }
umask 077
mkdir -p "$(dirname "$SPARKLE_KEY_FILE")"
der="$(mktemp)"
trap 'rm -f "$der"' EXIT
openssl genpkey -algorithm ed25519 -outform DER -out "$der"
tail -c "$ED25519_RAW_BYTES" "$der" | base64 >"$SPARKLE_KEY_FILE"
chmod 600 "$SPARKLE_KEY_FILE"
sparkle_public_key_of "$SPARKLE_KEY_FILE" >"$SPARKLE_PUBLIC_KEY_FILE"
sparkle_check_key
echo "Private key: $SPARKLE_KEY_FILE (keep a copy in your password manager)"
echo "Public key:  $SPARKLE_PUBLIC_KEY_FILE (commit it)"

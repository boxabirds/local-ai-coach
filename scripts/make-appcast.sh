#!/usr/bin/env bash
# Write the update list for one release (Ceetrix story 39).
#
#   scripts/make-appcast.sh <version> <dmg> <notes.md> [<out>]     (default out: <dmg's folder>/appcast.xml)
#
# One item: the version, its release notes (Markdown), and the disk image's address with
# its length and Ed25519 signature; then the list itself is signed (the app requires both).
# make publish uploads it with the release; the app reads the newest release's copy.
#
#   SPARKLE_KEY_FILE          the private update key (default ~/.config/local-ai-coach/sparkle_ed25519)
#   COACH_SPARKLE_PUBLIC_KEY  the public key it must match (default apps/mac/sparkle-public-key)
#   COACH_RELEASE_DOWNLOADS   where release files are served (default this repo's GitHub releases)
# Writes nothing unless every step succeeds.
set -euo pipefail
source "$(dirname "$0")/sparkle-lib.sh"

VERSION="${1:?usage: make-appcast.sh <version> <dmg> <notes.md> [<out>]}"
DMG="${2:?usage: make-appcast.sh <version> <dmg> <notes.md> [<out>]}"
NOTES="${3:?usage: make-appcast.sh <version> <dmg> <notes.md> [<out>]}"
OUT="${4:-$(dirname "$DMG")/appcast.xml}"
DOWNLOADS="${COACH_RELEASE_DOWNLOADS:-https://github.com/boxabirds/local-ai-coach/releases/download}"
MINIMUM_MACOS="$(/usr/libexec/PlistBuddy -c "Print :LSMinimumSystemVersion" "$SPARKLE_ROOT/apps/mac/Info.plist")"
VERSION_PATTERN='^[0-9A-Za-z.+-]+$'

fail() { echo "make-appcast: $*" >&2; exit 1; }
[[ "$VERSION" =~ $VERSION_PATTERN ]] || fail "'$VERSION' is not a version"
[ -f "$DMG" ] || fail "no disk image at $DMG"
[ -f "$NOTES" ] || fail "no release notes at $NOTES"
sparkle_check_key || exit 1
SIGN_UPDATE="$(sparkle_tool sign_update)"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/appcast.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

enclosure="$("$SIGN_UPDATE" --ed-key-file "$SPARKLE_KEY_FILE" "$DMG")" || fail "sign_update could not sign $DMG"
# Release notes in CDATA; a "]]>" in them is split so it can't end the section.
notes="$(sed 's/]]>/]]]]><![CDATA[>/g' "$NOTES")"
url="$DOWNLOADS/v$VERSION/$(basename "$DMG")"

cat >"$WORK/appcast.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Local AI Coach</title>
    <item>
      <title>$VERSION</title>
      <pubDate>$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')</pubDate>
      <sparkle:version>$VERSION</sparkle:version>
      <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>$MINIMUM_MACOS</sparkle:minimumSystemVersion>
      <description sparkle:format="markdown"><![CDATA[$notes]]></description>
      <enclosure url="$url" type="application/octet-stream" $enclosure />
    </item>
  </channel>
</rss>
EOF
xmllint --noout "$WORK/appcast.xml" || fail "the update list isn't valid XML"
"$SIGN_UPDATE" --ed-key-file "$SPARKLE_KEY_FILE" "$WORK/appcast.xml" || fail "sign_update could not sign the update list"
mv "$WORK/appcast.xml" "$OUT"
echo "Wrote $OUT ($VERSION, $url)"

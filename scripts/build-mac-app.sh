#!/usr/bin/env bash
# Build Local AI Coach.app, and the disk image testers download (Ceetrix story 35).
#
#   scripts/build-mac-app.sh <version>              ad-hoc signed app, for tests
#   scripts/build-mac-app.sh <version> --sign       signed with the Developer ID, hardened runtime
#   scripts/build-mac-app.sh <version> --notarize   --sign, then notarised and stapled, in a
#                                                   signed, notarised, stapled disk image
#
# The app carries the release trees scripts/build-release.sh leaves in dist/
# (release-darwin-arm64, release-darwin-x64; at least one) and runs their own
# launcher, bin/local-ai-coach. Signing follows macscreencap's pipeline
# (ScreencapMenuBar/build-app.sh): every Mach-O file inside out, then the app.
#
#   COACH_MAC_DIST   where the trees are and the app goes (default <repo>/dist)
#   NOTARY_PROFILE   notarytool's keychain profile (default notarytool-profile)
set -euo pipefail

VERSION="${1:?usage: build-mac-app.sh <version> [--sign|--notarize]}"
MODE="${2:-adhoc}"
case "$MODE" in adhoc | --sign | --notarize) ;; *) echo "build-mac-app: unknown option $MODE" >&2; exit 1 ;; esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAC="$ROOT/apps/mac"
DIST="${COACH_MAC_DIST:-$ROOT/dist}"
NAME="Local AI Coach"
APP="$DIST/$NAME.app"
DMG="$DIST/Local-AI-Coach-$VERSION.dmg"
NOTARY_PROFILE="${NOTARY_PROFILE:-notarytool-profile}"
NOTARY_TIMEOUT=30m
ARCHES=(arm64 x64)

fail() { echo "build-mac-app: $*" >&2; exit 1; }

# ---------------------------------------------------------------- the release trees, checked first
trees=()
for arch in "${ARCHES[@]}"; do
  tree="$DIST/release-darwin-$arch"
  [ -d "$tree" ] || continue
  [ "$(cat "$tree/VERSION" 2>/dev/null)" = "$VERSION" ] || fail "$tree is version '$(cat "$tree/VERSION" 2>/dev/null)', not $VERSION. Build the release for $VERSION first."
  trees+=("$arch")
done
[ "${#trees[@]}" -gt 0 ] || fail "no release tree in $DIST (release-darwin-arm64 or release-darwin-x64). Run scripts/build-release.sh $VERSION first."

IDENTITY=-
if [ "$MODE" != adhoc ]; then
  IDENTITY="$(security find-identity -v -p codesigning | grep 'Developer ID Application' | head -n 1 | awk -F'"' '{print $2}')"
  [ -n "$IDENTITY" ] || fail "no Developer ID Application certificate in the keychain"
fi

# ---------------------------------------------------------------- the app
echo "Building $NAME.app $VERSION (${trees[*]})"
SWIFT=(swift build -c release --arch arm64 --arch x86_64 --package-path "$MAC")
"${SWIFT[@]}" >/dev/null
BIN="$("${SWIFT[@]}" --show-bin-path)"

rm -rf "$APP" "$DMG"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN/LocalAICoach" "$APP/Contents/MacOS/LocalAICoach"
cp "$MAC/Info.plist" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $VERSION" "$APP/Contents/Info.plist"

ICONS="$(mktemp -d "${TMPDIR:-/tmp}/coach-icon.XXXXXX")"
trap 'rm -rf "$ICONS"' EXIT
"$BIN/make-icon" "$ICONS/AppIcon.iconset"
iconutil -c icns "$ICONS/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

for arch in "${trees[@]}"; do
  # ditto keeps permissions and symbolic links.
  ditto "$DIST/release-darwin-$arch" "$APP/Contents/Resources/coach-$arch"
done

# ---------------------------------------------------------------- signing
if [ "$MODE" = adhoc ]; then
  codesign --force --sign - "$APP"
else
  echo "Signing with $IDENTITY"
  SIGN=(codesign --force --options runtime --timestamp --sign "$IDENTITY")
  macho="$ICONS/macho.txt"
  # Every Mach-O file in the trees: executables, .so and .dylib files.
  # One file at a time: file's own output can't be split reliably (universal files add lines).
  find "$APP/Contents/Resources" -type f \( -perm -u+x -o -name '*.so' -o -name '*.dylib' \) -print0 |
    while IFS= read -r -d '' each; do
      case "$(file -b "$each")" in *Mach-O*) printf '%s\n' "$each" ;; esac
    done >"$macho"
  echo "  $(wc -l <"$macho" | tr -d ' ') Mach-O files"
  for arch in "${trees[@]}"; do
    tree="$APP/Contents/Resources/coach-$arch"
    # The page server is Bun: its JavaScript engine compiles at run time (Bun's documented entitlements).
    "${SIGN[@]}" --entitlements "$MAC/entitlements/bun.plist" "$tree/bin/coach-web"
    # Python: ctypes and cffi callbacks need writable executable memory.
    "${SIGN[@]}" --entitlements "$MAC/entitlements/python.plist" "$(cd "$tree/python/bin" && pwd -P)/$(readlink "$tree/python/bin/python3" || echo python3)"
  done
  grep -v -e '/bin/coach-web$' -e '/python/bin/python3' "$macho" | tr '\n' '\0' | xargs -0 -n 200 "${SIGN[@]}"
  "${SIGN[@]}" --entitlements "$MAC/entitlements/app.plist" "$APP"
fi
codesign --verify --deep --strict "$APP"
echo "Built $APP"

[ "$MODE" = --notarize ] || exit 0

# ---------------------------------------------------------------- notarising and the disk image
notarise() {
  echo "Notarising $(basename "$1")"
  xcrun notarytool submit "$1" --keychain-profile "$NOTARY_PROFILE" --wait --timeout "$NOTARY_TIMEOUT" | tee "$ICONS/notary.txt"
  grep -q 'status: Accepted' "$ICONS/notary.txt" || fail "Apple did not accept $(basename "$1"). See: xcrun notarytool log <id> --keychain-profile $NOTARY_PROFILE"
}

ditto -c -k --keepParent "$APP" "$ICONS/app.zip"
notarise "$ICONS/app.zip"
xcrun stapler staple "$APP"

STAGE="$ICONS/stage"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/$NAME.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
codesign --force --timestamp --sign "$IDENTITY" "$DMG"
notarise "$DMG"
xcrun stapler staple "$DMG"

spctl --assess --type execute --verbose "$APP"
xcrun stapler validate "$DMG"
echo "Built $DMG ($(du -h "$DMG" | cut -f1))"

#!/usr/bin/env bash
# ios-release.sh — build, sign, and upload the iOS app to App Store Connect /
# TestFlight with no Xcode UI.
#
# Replaces the manual flow (just ios-build → Xcode: Archive → Validate →
# Distribute App → App Store Connect encryption questionnaire):
#   1. Bumps bundle.iOS.bundleVersion in tauri.ios.conf.json   (--no-bump)
#   2. just ios-prepare (sync plist metadata, prepare SwiftPM deps)
#   3. cargo tauri ios build --export-method app-store-connect
#      (xcodebuild archive + distribution-signed IPA export; the API key env
#      vars below are forwarded by tauri as xcodebuild -authenticationKey…)
#   4. xcrun altool --validate-app / --upload-app                (--skip-validate)
#   5. Polls the App Store Connect API until the build finishes processing
#      and confirms export compliance is set                     (--no-wait)
#
# The encryption questionnaire is answered at build time by
# ITSAppUsesNonExemptEncryption + ITSEncryptionExportComplianceCode in
# src-tauri/Info.ios.plist (the code App Store Connect issued for our reviewed
# export-compliance documentation / French declaration); step 5 fails if App
# Store Connect reports the question as still unanswered.
#
# One-time setup:
#   1. appstoreconnect.apple.com → Users and Access → Integrations →
#      App Store Connect API → Team Keys → Generate API Key with the
#      "App Manager" role. Note the Key ID and the Issuer ID, and download
#      AuthKey_<KEYID>.p8 (downloadable only once).
#   2. mkdir -p ~/.appstoreconnect/private_keys && mv AuthKey_<KEYID>.p8 there.
#   3. export APPLE_API_KEY=<key id> APPLE_API_ISSUER=<issuer id>
#      APPLE_API_KEY_PATH is optional when the key lives in the directory above.
#
# CI needs exactly: a macOS runner with Xcode, these three values as secrets
# (store the .p8 contents as a secret and write it to
# ~/.appstoreconnect/private_keys/ in a setup step), rust + bun + just, and
# `bash apps/web/scripts/ios-release.sh --no-bump` with the build number
# managed by the pipeline.
#
# Usage: scripts/ios-release.sh [--no-bump] [--skip-validate] [--no-wait]

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

IOS_CONF="tauri/src-tauri/tauri.ios.conf.json"
TAURI_CONF="tauri/src-tauri/tauri.conf.json"
IPA_DIR="tauri/src-tauri/gen/apple/build/arm64"

BUMP=1
VALIDATE=1
WAIT=1
for arg in "$@"; do
  case "$arg" in
    --no-bump) BUMP=0 ;;
    --skip-validate) VALIDATE=0 ;;
    --no-wait) WAIT=0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
fail() { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

step "Pre-flight"
command -v bun >/dev/null || fail "bun not installed."
command -v just >/dev/null || fail "just not installed."
command -v cargo-tauri >/dev/null || cargo tauri --version >/dev/null 2>&1 \
  || fail "tauri CLI not installed (cargo install tauri-cli)."
[[ -n "${APPLE_API_KEY:-}" ]] || fail "APPLE_API_KEY not set (App Store Connect API Key ID — see header)."
[[ -n "${APPLE_API_ISSUER:-}" ]] || fail "APPLE_API_ISSUER not set (App Store Connect Issuer ID — see header)."
if grep -q "REPLACE_WITH_EXPORT_COMPLIANCE_CODE" tauri/src-tauri/Info.ios.plist; then
  fail "ITSEncryptionExportComplianceCode is still a placeholder in tauri/src-tauri/Info.ios.plist.
  Paste the export compliance code App Store Connect issued for our reviewed encryption
  documentation (French declaration) — find it in App Store Connect under the app's
  encryption/App Encryption Documentation section, or complete the compliance questionnaire
  once more for a build: the final screen displays the code to put in Info.plist.
  Update gen/apple/project.yml and gen/apple/app_iOS/Info.plist to match."
fi

# altool only searches ./private_keys, ~/private_keys, ~/.private_keys and
# ~/.appstoreconnect/private_keys for AuthKey_<ID>.p8, so make sure the key is
# in the canonical spot; tauri/xcodebuild take an explicit path instead.
CANONICAL_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${APPLE_API_KEY}.p8"
if [[ -z "${APPLE_API_KEY_PATH:-}" ]]; then
  [[ -f "$CANONICAL_KEY_PATH" ]] \
    || fail "API key not found at $CANONICAL_KEY_PATH. Put AuthKey_${APPLE_API_KEY}.p8 there or set APPLE_API_KEY_PATH."
  export APPLE_API_KEY_PATH="$CANONICAL_KEY_PATH"
elif [[ ! -f "$APPLE_API_KEY_PATH" ]]; then
  fail "APPLE_API_KEY_PATH points to a missing file: $APPLE_API_KEY_PATH"
fi
if [[ ! -f "$CANONICAL_KEY_PATH" ]]; then
  mkdir -p "$(dirname "$CANONICAL_KEY_PATH")"
  cp "$APPLE_API_KEY_PATH" "$CANONICAL_KEY_PATH"
  chmod 600 "$CANONICAL_KEY_PATH"
  echo "Copied API key to $CANONICAL_KEY_PATH (required by altool)."
fi

BUNDLE_ID="$(bun -e "console.log(JSON.parse(require('node:fs').readFileSync('$TAURI_CONF', 'utf8')).identifier)")"

if [[ "$BUMP" == 1 ]]; then
  step "Bumping build number"
  BUILD_NUMBER="$(bun -e "
    const fs = require('node:fs');
    const conf = JSON.parse(fs.readFileSync('$IOS_CONF', 'utf8'));
    const current = conf.bundle?.iOS?.bundleVersion;
    if (!/^\d+\$/.test(current ?? '')) {
      console.error(\`bundleVersion \${JSON.stringify(current)} is not a plain integer; bump it manually and rerun with --no-bump.\`);
      process.exit(1);
    }
    conf.bundle.iOS.bundleVersion = String(Number(current) + 1);
    fs.writeFileSync('$IOS_CONF', JSON.stringify(conf, null, 2) + '\n');
    console.log(conf.bundle.iOS.bundleVersion);
  ")"
  echo "bundleVersion → $BUILD_NUMBER (remember to commit $IOS_CONF)"
else
  BUILD_NUMBER="$(bun -e "console.log(JSON.parse(require('node:fs').readFileSync('$IOS_CONF', 'utf8')).bundle.iOS.bundleVersion)")"
fi
MARKETING_VERSION="$(bun -e "console.log(JSON.parse(require('node:fs').readFileSync('$IOS_CONF', 'utf8')).version)")"
echo "Releasing $BUNDLE_ID $MARKETING_VERSION ($BUILD_NUMBER)"

step "Preparing iOS project"
just ios-prepare

step "Building, archiving, and exporting IPA (this takes a while)"
(cd tauri/src-tauri && cargo tauri ios build --export-method app-store-connect --ci)

IPA="$(ls -t "$IPA_DIR"/*.ipa 2>/dev/null | head -1 || true)"
[[ -n "$IPA" ]] || fail "No IPA found in $IPA_DIR after build."
echo "IPA: $IPA"

if [[ "$VALIDATE" == 1 ]]; then
  step "Validating with App Store Connect"
  xcrun altool --validate-app --type ios -f "$IPA" \
    --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
fi

step "Uploading to App Store Connect"
xcrun altool --upload-app --type ios -f "$IPA" \
  --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"

if [[ "$WAIT" == 1 ]]; then
  step "Waiting for App Store Connect to process build $BUILD_NUMBER"
  bun scripts/ios-app-store-connect-build.mjs \
    --bundle-id "$BUNDLE_ID" \
    --version "$MARKETING_VERSION" \
    --build "$BUILD_NUMBER"
fi

printf "\n\033[1;32m✓ %s %s (%s) uploaded to App Store Connect.\033[0m\n" \
  "$BUNDLE_ID" "$MARKETING_VERSION" "$BUILD_NUMBER"
if [[ "$BUMP" == 1 ]]; then
  echo "Don't forget to commit the version bump ($IOS_CONF and synced plists)."
fi

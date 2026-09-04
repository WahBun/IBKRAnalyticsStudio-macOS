#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/IBKR Analytics Studio.app"
OUTPUT_DIR="$ROOT_DIR/outputs"
ARCH="${ARCH:-$(uname -m)}"
DMG_PATH="$OUTPUT_DIR/IBKR-Analytics-Studio-2.2.0-macos-${ARCH}.dmg"
STAGING_DIR="${TMPDIR:-/tmp}/ibkr-analytics-studio-dmg"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  echo "Run npm run tauri:build first." >&2
  exit 1
fi

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR" "$OUTPUT_DIR"

ditto "$APP_PATH" "$STAGING_DIR/IBKR Analytics Studio.app"
ln -s /Applications "$STAGING_DIR/Applications"

codesign --force --deep --sign - "$STAGING_DIR/IBKR Analytics Studio.app"
codesign --verify --deep --strict --verbose=2 "$STAGING_DIR/IBKR Analytics Studio.app"

hdiutil create \
  -volname "IBKR Analytics Studio" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

hdiutil verify "$DMG_PATH"

rm -rf "$STAGING_DIR"
echo "Created $DMG_PATH"

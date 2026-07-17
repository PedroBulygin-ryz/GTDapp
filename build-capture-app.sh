#!/bin/zsh
set -euo pipefail

APP_NAME="Bubbles Capture"
APP_DIR="$PWD/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"

cp capture-app/Info.plist "$CONTENTS_DIR/Info.plist"
swiftc -parse-as-library capture-app/main.swift \
  -framework AppKit \
  -framework Carbon \
  -o "$MACOS_DIR/$APP_NAME"

chmod +x "$MACOS_DIR/$APP_NAME"
echo "$APP_DIR"

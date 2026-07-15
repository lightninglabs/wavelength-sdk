#!/usr/bin/env bash
# Build the wavewalletdk gomobile bindings from the darepo-client checkout and
# stage them into this package: android/libs/Wavewalletdk.aar and
# ios/Wavewalletdk.xcframework. Both are gitignored; run this after cloning
# and again whenever the paired daemon revision changes (the same revision
# that RUNTIME_MANIFEST_VERSION tracks for the wasm assets).
#
# Usage: fetch-bindings.sh [android|ios|all]   (default: all)
# Env:   WAVELENGTH_DIR  path to the darepo-client checkout
#                    (default: sibling of the repo root, ../wavelength)
#
# Android needs the Android SDK + NDK and a JDK (17+); iOS needs macOS with
# Xcode. Both need Go and gomobile (darepo-client's gen_bindings.sh checks).
set -euo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PKG/../.." && pwd)"
DAREPO="${WAVELENGTH_DIR:-$ROOT/../wavelength}"
TARGET="${1:-all}"

if [[ ! -d "$DAREPO" ]]; then
  echo "darepo-client checkout not found at $DAREPO; set WAVELENGTH_DIR" >&2
  exit 1
fi

case "$TARGET" in
  android|ios|all) ;;
  *) echo "usage: fetch-bindings.sh [android|ios|all]" >&2; exit 1 ;;
esac

# Build first so a failed build leaves previously staged artifacts intact.
make -C "$DAREPO" mobile target="$TARGET"

BUILD="$DAREPO/sdk/wavewalletdk/mobile/build"

if [[ "$TARGET" == "android" || "$TARGET" == "all" ]]; then
  mkdir -p "$PKG/android/libs"
  rm -f "$PKG/android/libs/Wavewalletdk.aar"
  cp "$BUILD/android/Wavewalletdk.aar" "$PKG/android/libs/"
  echo "Staged android/libs/Wavewalletdk.aar"
fi

if [[ "$TARGET" == "ios" || "$TARGET" == "all" ]]; then
  mkdir -p "$PKG/ios"
  rm -rf "$PKG/ios/Wavewalletdk.xcframework"
  cp -R "$BUILD/ios/Wavewalletdk.xcframework" "$PKG/ios/"
  # gomobile's generated headers use the ObjC modules syntax (@import), which
  # clang rejects while compiling the Objective-C++ turbo module glue. Rewrite
  # it to a classic #import so consumers need no special module flags.
  find "$PKG/ios/Wavewalletdk.xcframework" -name '*.h' \
    -exec sed -i '' 's|@import Foundation;|#import <Foundation/Foundation.h>|' {} +
  echo "Staged ios/Wavewalletdk.xcframework"
fi

#!/usr/bin/env bash
# Download the prebuilt wavewalletdk gomobile bindings from the pinned
# wavelength release and stage them into this package:
# android/libs/Wavewalletdk.aar and ios/Wavewalletdk.xcframework. Both are
# gitignored; run this after cloning and again whenever the paired daemon
# revision changes.
#
# The binaries come from the wavelength GitHub release tagged with
# RUNTIME_MANIFEST_VERSION from packages/core, the same version that pins the
# wasm runtime assets: its mobile-bindings workflow builds them on every v*
# tag and attaches Wavewalletdk.aar and Wavewalletdk.xcframework.tar.gz. The
# pinned version is therefore the only input, so there is nothing else to keep
# in sync. To build the bindings from a local daemon checkout instead (for an
# unreleased daemon revision), use bindings-local.sh.
#
# Usage: fetch-bindings.sh [android|ios|all]   (default: all)
set -euo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PKG/../.." && pwd)"
TARGET="${1:-all}"

case "$TARGET" in
  android|ios|all) ;;
  *) echo "usage: fetch-bindings.sh [android|ios|all]" >&2; exit 1 ;;
esac

# The pinned daemon version, which is also the wavelength release tag.
VERSION="$(node "$ROOT/scripts/runtime-version.mjs")"
BASE_URL="https://github.com/lightninglabs/wavelength/releases/download/$VERSION"

# Download and unpack into a temp directory, and stage every selected artifact
# only once all of them are complete. Staging as each one arrives would let a
# failure part way through the default all target leave Android on the new
# daemon revision while iOS still held the old one, with nothing on disk
# recording the mismatch.
TMP="$(mktemp -d "$PKG/.fetch-bindings-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  local asset="$1"
  echo "Fetching $BASE_URL/$asset"
  if ! curl -fsSL --retry 3 --retry-delay 2 "$BASE_URL/$asset" -o "$TMP/$asset"; then
    # By far the most likely cause is a release that exists but has not been
    # published yet: assets on a draft release are not publicly downloadable,
    # so the URL 404s exactly as it would for a missing tag.
    echo "could not download $BASE_URL/$asset" >&2
    echo "check that the wavelength release tagged $VERSION exists and is published (draft releases serve no public assets)" >&2
    exit 1
  fi
  if [[ ! -s "$TMP/$asset" ]]; then
    echo "downloaded $asset is empty" >&2
    exit 1
  fi
}

if [[ "$TARGET" == "android" || "$TARGET" == "all" ]]; then
  fetch "Wavewalletdk.aar"
fi

if [[ "$TARGET" == "ios" || "$TARGET" == "all" ]]; then
  fetch "Wavewalletdk.xcframework.tar.gz"
  tar -xzf "$TMP/Wavewalletdk.xcframework.tar.gz" -C "$TMP" Wavewalletdk.xcframework
  # gomobile's generated headers use the ObjC modules syntax (@import), which
  # clang rejects while compiling the Objective-C++ turbo module glue. Rewrite
  # it to a classic #import so consumers need no special module flags. The
  # release archive is the raw gomobile output, so this is done here. Downloading
  # needs no Xcode, so this runs on Linux too; the explicit backup suffix is the
  # in-place form both BSD and GNU sed accept, where a bare -i '' is BSD only.
  find "$TMP/Wavewalletdk.xcframework" -name '*.h' \
    -exec sed -i.orig 's|@import Foundation;|#import <Foundation/Foundation.h>|' {} +
  find "$TMP/Wavewalletdk.xcframework" -name '*.h.orig' -delete
fi

# Every selected artifact is now complete in $TMP, so the only work left is
# local renames. The failures that take real time to reach (a missing release
# asset, a dropped download, a header rewrite the host's sed rejects) have all
# happened above, with the previously staged set untouched. A kill landing
# between the two renames below can still mix revisions; rerunning fixes it.
if [[ "$TARGET" == "android" || "$TARGET" == "all" ]]; then
  mkdir -p "$PKG/android/libs"
  rm -f "$PKG/android/libs/Wavewalletdk.aar"
  mv "$TMP/Wavewalletdk.aar" "$PKG/android/libs/"
  echo "Staged android/libs/Wavewalletdk.aar"
fi

if [[ "$TARGET" == "ios" || "$TARGET" == "all" ]]; then
  mkdir -p "$PKG/ios"
  rm -rf "$PKG/ios/Wavewalletdk.xcframework"
  mv "$TMP/Wavewalletdk.xcframework" "$PKG/ios/"
  echo "Staged ios/Wavewalletdk.xcframework"
fi

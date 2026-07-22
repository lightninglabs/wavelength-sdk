#!/usr/bin/env bash
# Download the wavelength runtime asset set into public/runtime/<version>/ for
# CI deploys. vite build copies public/ into dist/. The version segment is
# RUNTIME_MANIFEST_VERSION from packages/core, so the deployed asset URLs change
# whenever the pinned daemon version is bumped and browsers can never serve a
# stale cached runtime.
#
# The assets come from the wavelength GitHub release tagged with that same
# version: its mobile-bindings workflow builds the set on every v* tag and
# attaches it as Wavewalletdk.wasm.tar.gz. The pinned version is therefore the
# only input, doubling as both the release tag and the staged path, so there is
# nothing else to keep in sync. To build the set from a local checkout instead
# (for an unreleased daemon revision), use wasm:local.
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"

# The pinned daemon version, which is also the wavelength release tag.
VERSION="$(node "$ROOT/scripts/runtime-version.mjs")"

ARCHIVE="Wavewalletdk.wasm.tar.gz"
URL="https://github.com/lightninglabs/wavelength/releases/download/$VERSION/$ARCHIVE"

PUB="$APP/public/runtime/$VERSION"

# Keep the file list in sync with packages/web/src/runtime-manifest.ts
# (RUNTIME_ASSET_FILES), wasm-local.sh, and the archive contents built by
# wavelength's mobile-bindings workflow.
FILES=(
  wavewalletdk.wasm
  wavewalletdk.wasm.gz
  wasm_exec.js
  sqlite-bridge.js
  sqlite-worker.js
  sqlite3.js
  sqlite3.wasm
  sqlite3-opfs-async-proxy.js
)

# Unpack into a temp directory and swap it in only once the full set is present,
# so an aborted run cannot leave a partial asset set behind for a later vite
# build to ship.
mkdir -p "$APP/public/runtime"
TMP="$(mktemp -d "$APP/public/runtime/.fetch-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching $URL"
if ! curl -fsSL "$URL" -o "$TMP/$ARCHIVE"; then
  # By far the most likely cause is a release that exists but has not been
  # published yet: assets on a draft release are not publicly downloadable, so
  # the URL 404s exactly as it would for a missing tag.
  echo "could not download $URL" >&2
  echo "check that the wavelength release tagged $VERSION exists and is published (draft releases serve no public assets)" >&2
  exit 1
fi

# The archive stores the asset set flat, with no leading directory component.
# Naming the members explicitly stages exactly what this app requests: the
# archive is built from a file list in a different repository, so anything it
# gains would otherwise ride into dist/ unnoticed.
tar -xzf "$TMP/$ARCHIVE" -C "$TMP" "${FILES[@]}"
rm -f "$TMP/$ARCHIVE"

# tar itself rejects a member the archive dropped, aborting before this runs.
# What is left to catch is a member that extracted but arrived empty.
for f in "${FILES[@]}"; do
  if [[ ! -s "$TMP/$f" ]]; then
    echo "$ARCHIVE is missing runtime asset $f (or it is empty)" >&2
    exit 1
  fi
done

rm -rf "$PUB"
mv "$TMP" "$PUB"

echo "Staged runtime assets into $PUB"

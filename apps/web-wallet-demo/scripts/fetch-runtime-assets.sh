#!/usr/bin/env bash
# Download the walletdk runtime asset set from a public base URL (e.g. GCS) into
# public/runtime/<version>/ for CI deploys. vite build copies public/ into
# dist/. The version segment is RUNTIME_MANIFEST_VERSION from packages/core, so
# the deployed asset URLs change whenever the pinned daemon version is bumped
# and browsers can never serve a stale cached runtime.
set -euo pipefail

BASE="${RUNTIME_ASSETS_BASE_URL:-}"
if [[ -z "${BASE// }" ]]; then
  echo "RUNTIME_ASSETS_BASE_URL must be set to the hosted assets root (unversioned, no trailing slash)" >&2
  exit 1
fi
BASE="${BASE%/}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"

# The pinned daemon version.
VERSION="$(node "$ROOT/scripts/runtime-version.mjs")"

# Tolerate a base URL that mistakenly includes the current version segment, but
# surface it: the variable should be the unversioned root, and a value pinned to
# an old version will 404 after the next bump. ::warning:: renders as an
# annotation in GitHub Actions and is harmless elsewhere.
if [[ "$BASE" == */"$VERSION" ]]; then
  echo "::warning::RUNTIME_ASSETS_BASE_URL ends with /$VERSION; set it to the unversioned assets root."
  BASE="${BASE%/"$VERSION"}"
fi

PUB="$APP/public/runtime/$VERSION"

# Keep the file list in sync with packages/web/src/runtime-manifest.ts
# (RUNTIME_ASSET_FILES), wasm-local.sh, and
# apps/docs/scripts/copy-runtime-assets.mjs.
FILES=(
  walletdk.wasm
  walletdk.wasm.gz
  wasm_exec.js
  sqlite-bridge.js
  sqlite-worker.js
  sqlite3.js
  sqlite3.wasm
  sqlite3-opfs-async-proxy.js
)

# Download into a temp directory and swap it in only once the full set has
# arrived, so an aborted run cannot leave a partial asset set behind for a
# later vite build to ship.
mkdir -p "$APP/public/runtime"
TMP="$(mktemp -d "$APP/public/runtime/.fetch-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

for f in "${FILES[@]}"; do
  url="$BASE/$VERSION/$f"
  echo "Fetching $url"
  curl -fsSL "$url" -o "$TMP/$f"
done

for f in "${FILES[@]}"; do
  if [[ ! -s "$TMP/$f" ]]; then
    echo "downloaded asset $f is missing or empty" >&2
    exit 1
  fi
done

rm -rf "$PUB"
mv "$TMP" "$PUB"

echo "Staged runtime assets into $PUB"

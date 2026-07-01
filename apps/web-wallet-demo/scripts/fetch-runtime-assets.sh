#!/usr/bin/env bash
# Download the walletdk runtime asset set from a public base URL (e.g. GCS) into
# public/ for CI deploys. vite build copies public/ into dist/.
set -euo pipefail

BASE="${RUNTIME_ASSETS_BASE_URL:-}"
if [[ -z "${BASE// }" ]]; then
  echo "RUNTIME_ASSETS_BASE_URL must be set to the hosted asset directory (no trailing slash)" >&2
  exit 1
fi
BASE="${BASE%/}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$APP/public"
mkdir -p "$PUB"

# Keep in sync with packages/web/src/runtime-manifest.ts and wasm-local.sh.
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

for f in "${FILES[@]}"; do
  url="$BASE/$f"
  echo "Fetching $url"
  curl -fsSL "$url" -o "$PUB/$f"
done

echo "Staged runtime assets into $PUB"

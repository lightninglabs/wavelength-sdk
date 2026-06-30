#!/usr/bin/env bash
# Build the walletdk wasm runtime from the sibling darepo-client checkout and
# stage the full runtime asset set into public/ for local dev + smoke tests.
# vite build then copies public/ into dist/, which smoke-server.js serves.
set -euo pipefail
DAREPO="${DAREPO_DIR:-../../../darepo-client}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$APP/public"
mkdir -p "$PUB"

# Build the wasm blob + go-wasmsqlite assets into the sibling repo's bin/wasm.
make -C "$DAREPO" wasm-wallet

# Built wasm blob + the full go-wasmsqlite asset set from bin/wasm. sqlite-bridge.js
# is upstream go-wasmsqlite's main-thread bridge, version-locked to sqlite-worker.js
# via their protocol handshake, so it ships from the build like the rest of the stack.
for f in walletdk.wasm walletdk.wasm.gz wasm_exec.js sqlite-bridge.js \
         sqlite-worker.js sqlite3.js sqlite3.wasm sqlite3-opfs-async-proxy.js; do
  cp "$DAREPO/bin/wasm/$f" "$PUB/"
done

# The SDK worker glue (walletdk-worker.js) now ships inside @lightninglabs/walletdk-web
# and is emitted by the consumer's bundler, so it is no longer staged here.

echo "Staged runtime assets into $PUB"

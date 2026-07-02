#!/usr/bin/env bash
# Build the walletdk wasm runtime from the sibling darepo-client checkout and
# stage the full runtime asset set into public/runtime/<version>/ for local dev
# + smoke tests. vite build then copies public/ into dist/, which
# smoke-server.js serves. The version segment is RUNTIME_MANIFEST_VERSION from
# packages/core, matching where the demo's runtimeBaseUrl points.
set -euo pipefail
DAREPO="${DAREPO_DIR:-../../../darepo-client}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"

# The pinned daemon version.
VERSION="$(node "$ROOT/scripts/runtime-version.mjs")"

# Build the wasm blob + go-wasmsqlite assets into the sibling repo's bin/wasm.
# Build before touching public/ so a failed build leaves the previously staged
# runtime intact.
make -C "$DAREPO" wasm-wallet

# Drop previously staged asset sets (any version), plus any assets from the
# legacy unversioned layout at the public/ root, so stale copies do not ride
# into dist/ (public/ is an ephemeral, gitignored staging area).
rm -rf "$APP/public/runtime"
rm -f "$APP"/public/{walletdk.wasm,walletdk.wasm.gz,wasm_exec.js,sqlite-bridge.js,sqlite-worker.js,sqlite3.js,sqlite3.wasm,sqlite3-opfs-async-proxy.js}
PUB="$APP/public/runtime/$VERSION"
mkdir -p "$PUB"

# Built wasm blob + the full go-wasmsqlite asset set from bin/wasm. sqlite-bridge.js
# is upstream go-wasmsqlite's main-thread bridge, version-locked to sqlite-worker.js
# via their protocol handshake, so it ships from the build like the rest of the stack.
# Keep the file list in sync with packages/web/src/runtime-manifest.ts
# (RUNTIME_ASSET_FILES), fetch-runtime-assets.sh, and
# apps/docs/scripts/copy-runtime-assets.mjs.
for f in walletdk.wasm walletdk.wasm.gz wasm_exec.js sqlite-bridge.js \
         sqlite-worker.js sqlite3.js sqlite3.wasm sqlite3-opfs-async-proxy.js; do
  cp "$DAREPO/bin/wasm/$f" "$PUB/"
done

# The SDK worker glue (walletdk-worker.js) now ships inside @lightninglabs/walletdk-web
# and is emitted by the consumer's bundler, so it is no longer staged here.

echo "Staged runtime assets into $PUB"

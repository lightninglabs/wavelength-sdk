/**
 * RUNTIME_ASSETS is the canonical set of daemon runtime binaries the wasm client
 * loads at runtime, resolved against runtimeBaseUrl. They are built by
 * darepo-client (`make wasm-wallet`) and version-locked to the embedded walletdk
 * daemon, so they ship together and must be hosted side by side at a single base
 * URL.
 *
 * This is the single source of truth for the (future) CDN publish step and the
 * self-host instructions. The standalone worker (walletdk-worker.js) cannot
 * import this module, so it mirrors these names literally; keep the two in sync.
 */
export const RUNTIME_ASSETS = {
  wasm: 'walletdk.wasm',
  wasmGz: 'walletdk.wasm.gz',
  wasmExec: 'wasm_exec.js',
  sqliteBridge: 'sqlite-bridge.js',
  sqliteWorker: 'sqlite-worker.js',
  sqlite: 'sqlite3.js',
  sqliteWasm: 'sqlite3.wasm',
  sqliteOpfsProxy: 'sqlite3-opfs-async-proxy.js',
} as const;

/**
 * RUNTIME_ASSET_FILES is the flat list of every runtime binary that must be
 * hosted together at runtimeBaseUrl.
 */
export const RUNTIME_ASSET_FILES: readonly string[] =
  Object.values(RUNTIME_ASSETS);

/**
 * RUNTIME_MANIFEST_VERSION identifies this runtime asset set. Bump it whenever
 * the daemon wasm or the go-wasmsqlite stack changes so hosted assets and the
 * client stay in lockstep. Wire this to the darepo-client release tag once it
 * ships.
 */
export const RUNTIME_MANIFEST_VERSION = '0.0.0-dev';

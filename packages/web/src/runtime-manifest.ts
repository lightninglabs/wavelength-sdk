/**
 * RUNTIME_ASSETS is the canonical set of daemon runtime binaries the wasm client
 * loads at runtime, resolved against runtimeBaseUrl. They are built by
 * wavelength (`make wasm-wallet`) and version-locked to the embedded wavewalletdk
 * daemon, so they ship together and must be hosted side by side at a single base
 * URL.
 *
 * This is the single source of truth for the self-host instructions, and the
 * set the release archive is expected to carry. The standalone worker
 * (wavewalletdk-worker.js) cannot
 * import this module, so it mirrors these names literally; keep the two in sync.
 *
 * The version of the asset set (RUNTIME_MANIFEST_VERSION) lives in core, next
 * to the generated daemon types it is paired with.
 */
export const RUNTIME_ASSETS = {
  wasm: 'wavewalletdk.wasm',
  wasmGz: 'wavewalletdk.wasm.gz',
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

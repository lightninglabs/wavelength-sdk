import {
  createWalletEngine,
  type DistributiveOmit,
  type ExternalSeedWalletClient,
  type PasskeyCeremony,
  type WavelengthPerformanceListener,
  type WalletEngine,
  type WalletEngineOptions,
} from '@lightninglabs/wavelength-core';
import {
  assertPasskeyPrf,
  createWebPasskeyCeremony,
  registerPasskeyWallet,
  supportsPasskeyPrf,
} from './passkey.ts';
import { MainThreadWavelengthClient } from './clients/main.ts';
import { WorkerWavelengthClient } from './clients/worker.ts';

/**
 * Selects which thread the wasm runtime runs on: 'worker' (default) in a
 * dedicated Web Worker that keeps the UI thread free, or 'main' on the page's
 * main thread as an escape hatch (e.g. environments without Worker support).
 */
export type RuntimeThread = 'main' | 'worker';

/**
 * Options for {@link createWebClient} controlling how and where the wasm runtime
 * is hosted and run.
 */
export type WebClientOptions = {
  /**
   * Overrides the worker entry point. By default the worker client spawns the
   * worker its bundler emits from new URL('../wavewalletdk-worker.js',
   * import.meta.url); supply this to point at a custom-hosted copy.
   * runtimeBaseUrl is still sent to the worker regardless of this override.
   * The worker performs runtime integrity verification, so serve any custom
   * copy from your app origin rather than the runtime asset host; an asset
   * host that also serves the verifier defeats the verification. Keep a
   * custom copy in sync with the installed SDK version: a copy predating
   * runtime integrity ignores the digest table this client sends it and
   * performs no verification at all, silently, with no warning.
   */
  workerURL?: string;
  /**
   * Base URL the daemon runtime binaries (wavewalletdk.wasm.gz, wasm_exec.js,
   * sqlite-*.js) are resolved against. Unset means relative to the page (the
   * demo self-hosts them from public/); SDK consumers point this at the hosted,
   * versioned runtime location. In worker mode an unset value defaults to the
   * document base URL, so assets resolve page-relative just like main-thread
   * mode.
   */
  runtimeBaseUrl?: string;
  /**
   * Which thread the wasm runtime runs on. Defaults to 'worker'. Set 'main' to
   * run the runtime on the page's main thread (it will block rendering while
   * busy).
   */
  runtimeThread?: RuntimeThread;
  /**
   * Log every RPC request and response payload to the console. Wallet secrets
   * (passwords, mnemonics, seed material, passkey PRF output) are redacted.
   * Off by default; payloads still include addresses and amounts, so logging is
   * opt-in for debugging and never on for a shipped app.
   */
  debug?: boolean;
  /**
   * Receives structured runtime timing samples. Omit it to disable
   * instrumentation and its timing calls.
   */
  onPerformance?: WavelengthPerformanceListener;
  /**
   * Keep a copy of the daemon runtime in Cache Storage so a returning visitor
   * reads it from disk instead of downloading it again. Defaults to true.
   *
   * Set false to take every runtime binary from the network. This is what you
   * want while iterating on a local daemon build: rebuilding at the same
   * RUNTIME_MANIFEST_VERSION produces a new binary at a bucket name that has
   * not changed, so the cached copy would keep being served instead. The
   * browser gives you no way out of this on its own; DevTools' "Disable cache"
   * governs the HTTP cache only and leaves Cache Storage untouched.
   *
   * Turning it off does not delete anything. An existing bucket is left exactly
   * as it is, and simply not read from or written to, so flipping this back on
   * resumes where it left off. To reclaim the space, clear site data.
   */
  runtimeCache?: boolean;
  /**
   * Verify the SHA-256 digest of the wasm binary and the bootstrap scripts
   * (wasm_exec.js, sqlite-bridge.js) against the digests pinned for
   * RUNTIME_MANIFEST_VERSION (RUNTIME_ASSET_DIGESTS) before executing them.
   * On by default. Set false only when running a runtime built from source
   * (for example a local wavelength checkout), whose bytes cannot match the
   * pinned release; disabling logs a one-time console warning so the switch
   * is never silently left off in production. A start with network 'mainnet'
   * rejects with invalid_config while verification is disabled.
   */
  runtimeIntegrity?: boolean;
};

/**
 * Creates an {@link ExternalSeedWalletClient} backed by the browser/wasm
 * transport. Defaults to the Web Worker transport; pass runtimeThread: 'main'
 * to run the runtime on the page's main thread instead.
 */
export function createWebClient(
  options: WebClientOptions = {},
): ExternalSeedWalletClient {
  return options.runtimeThread === 'main'
    ? new MainThreadWavelengthClient(options)
    : new WorkerWavelengthClient(options);
}

/**
 * Options for {@link createWebWalletEngine}: the web client options plus the
 * engine's config/autoStart. See {@link WalletEngineOptions} for the
 * config/autoStart field docs; the type requires config when autoStart is
 * true.
 */
export type WebWalletEngineOptions = WebClientOptions &
  DistributiveOmit<WalletEngineOptions, 'client'>;

/**
 * Creates a {@link WalletEngine} over the browser/wasm transport: the
 * one-call setup for a web app. Pass the engine to WavelengthProvider from
 * \@lightninglabs/wavelength-react, or drive it directly without React.
 */
export function createWebWalletEngine(
  options: WebWalletEngineOptions = {},
): WalletEngine {
  // Every WebClientOptions field has to be named twice here, because the rest
  // has to stay intact for createWalletEngine: spreading it is what preserves
  // the config/autoStart discriminated union. A field missing from these lists
  // is silently dropped rather than rejected, so clientOptionKeys below pins
  // them against the type.
  const {
    workerURL,
    runtimeBaseUrl,
    runtimeThread,
    debug,
    runtimeCache,
    onPerformance,
    runtimeIntegrity,
    ...engineOptions
  } = options;

  return createWalletEngine({
    client: createWebClient({
      workerURL,
      runtimeBaseUrl,
      runtimeThread,
      debug,
      runtimeCache,
      onPerformance,
      runtimeIntegrity,
    }),
    onPerformance,
    ...engineOptions,
  });
}

export { assertPasskeyPrf, registerPasskeyWallet, supportsPasskeyPrf };
export { createWebPasskeyCeremony };

/**
 * The browser (WebAuthn/PRF) implementation of the {@link PasskeyCeremony}
 * contract; pass it to useWalletPasskey, or drive it directly.
 */
export const webPasskeyCeremony: PasskeyCeremony = createWebPasskeyCeremony();

export { defaultConfig } from './config.ts';

export { MainThreadWavelengthClient } from './clients/main.ts';

export {
  RUNTIME_ASSETS,
  RUNTIME_ASSET_FILES,
  RUNTIME_ASSET_DIGESTS,
} from './runtime-manifest.ts';

// Re-export the core contract so a non-React consumer can import the client and
// every type/enum from this one package, the way wavelength-react already does.
// RUNTIME_MANIFEST_VERSION (the paired daemon version) rides along from core.
export * from '@lightninglabs/wavelength-core';

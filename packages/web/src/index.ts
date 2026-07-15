import {
  WavelengthClient,
  PasskeyCeremony,
  createWalletEngine,
  type DistributiveOmit,
  type WalletEngine,
  type WalletEngineOptions,
} from '@lightninglabs/wavelength-core';
import {
  assertPasskeyPrf,
  registerPasskeyWallet,
  supportsPasskeyPrf,
} from './passkey';
import { MainThreadWavelengthClient } from './clients/main';
import { WorkerWavelengthClient } from './clients/worker';

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
   * Log every RPC request and response payload to the console. Off by default;
   * payloads can include addresses and amounts, so logging is opt-in for
   * debugging and never on for a shipped app.
   */
  debug?: boolean;
};

/**
 * Creates a {@link WavelengthClient} backed by the browser/wasm transport. Defaults
 * to the Web Worker transport; pass runtimeThread: 'main' to run the runtime on
 * the page's main thread instead.
 */
export function createWebClient(
  options: WebClientOptions = {},
): WavelengthClient {
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
  const { workerURL, runtimeBaseUrl, runtimeThread, debug, ...engineOptions } =
    options;

  return createWalletEngine({
    client: createWebClient({ workerURL, runtimeBaseUrl, runtimeThread, debug }),
    ...engineOptions,
  });
}

export { assertPasskeyPrf, registerPasskeyWallet, supportsPasskeyPrf };

/**
 * The browser (WebAuthn/PRF) implementation of the {@link PasskeyCeremony}
 * contract; pass it to useWalletPasskey, or drive it directly.
 */
export const webPasskeyCeremony: PasskeyCeremony = {
  supportsPasskeyPrf,
  registerPasskeyWallet,
  assertPasskeyPrf,
};

export { defaultConfig } from './config';

export { MainThreadWavelengthClient } from './clients/main';

export { RUNTIME_ASSETS, RUNTIME_ASSET_FILES } from './runtime-manifest';

// Re-export the core contract so a non-React consumer can import the client and
// every type/enum from this one package, the way wavelength-react already does.
// RUNTIME_MANIFEST_VERSION (the paired daemon version) rides along from core.
export * from '@lightninglabs/wavelength-core';

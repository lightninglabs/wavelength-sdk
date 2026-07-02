import {
  BaseWalletDKClient,
  camelizeKeys,
  Entry,
  WalletDKError,
} from '@lightninglabs/walletdk-core';
import { RUNTIME_ASSETS } from '../runtime-manifest';
import type { WebClientOptions } from '../index';
import {
  instantiateWasm,
  loadScript,
  resolveRuntimeAsset,
  waitForReadyEvent,
  walletdkCall,
} from '../runtime';
import { ActivityHandle, debugTs, errorMessage } from '../util';

/**
 * Runs the wasm runtime on the page's main thread. It is the escape hatch for
 * environments without Web Worker support (or where main-thread execution is
 * preferred); select it via createWebClient({ runtimeThread: 'main' }). Unlike
 * worker mode it blocks rendering while the runtime is busy.
 */
export class MainThreadWalletDKClient extends BaseWalletDKClient {
  protected readonly serverTransport = 'rest' as const;
  private loadPromise: Promise<void> | null = null;
  private activityHandle: ActivityHandle | null = null;
  private readonly runtimeBaseUrl: string | undefined;
  private readonly debug: boolean;
  private readonly onRuntimeReady = () => this.emit({ type: 'runtimeReady' });

  constructor(options: WebClientOptions = {}) {
    super();
    this.runtimeBaseUrl = options.runtimeBaseUrl;
    this.debug = options.debug ?? false;
    // The runtime fires 'walletdk-ready' once; keep the handler reference so
    // dispose() can detach it if the client is torn down before it fires.
    globalThis.addEventListener('walletdk-ready', this.onRuntimeReady, {
      once: true,
    });
  }

  dispose(): void {
    super.dispose();
    globalThis.removeEventListener('walletdk-ready', this.onRuntimeReady);
  }

  ready(): Promise<void> {
    return this.ensureLoaded();
  }

  async callRaw<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    await this.ensureLoaded();

    const globalWallet = globalThis as typeof globalThis & {
      walletdkCall?: (method: string, params?: unknown) => Promise<T>;
    };

    if (typeof globalWallet.walletdkCall !== 'function') {
      throw new WalletDKError(
        'walletdk wasm runtime is not ready',
        'runtime_not_ready',
      );
    }

    try {
      if (this.debug) {
        console.log(`${debugTs()} Executing ${method}:`, params);
      }
      const result = await globalWallet.walletdkCall(method, params);
      if (this.debug) {
        console.log(`${debugTs()} Executed ${method} result:`, result);
      }

      return camelizeKeys<T>(result);
    } catch (err) {
      throw new WalletDKError(errorMessage(err), 'walletdk_error', {
        cause: err,
      });
    }
  }

  // startActivity opens the facade's pull-based activity stream and pumps each
  // entry to subscribers as an 'activity' event. The old bridge pushed a
  // 'walletdk-activity' DOM event; the wasm bridge hands back a subscription
  // handle instead, so the client drives the loop. Idempotent: a second call
  // while a stream is open is a no-op.
  async startActivity(opts: { includeExisting?: boolean } = {}): Promise<void> {
    await this.ensureLoaded();
    if (this.activityHandle) {
      return;
    }

    const call = walletdkCall();
    if (typeof call !== 'function') {
      throw new WalletDKError(
        'walletdk wasm runtime is not ready',
        'runtime_not_ready',
      );
    }

    const handle = (await call('subscribe', {
      includeExisting: opts.includeExisting ?? false,
    })) as ActivityHandle;
    this.activityHandle = handle;
    void this.pumpActivity(handle);
  }

  stopActivity(): void {
    const handle = this.activityHandle;
    this.activityHandle = null;
    handle?.close();
  }

  // pumpActivity drains the subscription handle until it ends (next() resolves
  // null) or stopActivity swaps the handle out from under it.
  private async pumpActivity(handle: ActivityHandle): Promise<void> {
    try {
      for (
        let entry = await handle.next();
        entry !== null && this.activityHandle === handle;
        entry = await handle.next()
      ) {
        this.emit({ type: 'activity', payload: camelizeKeys<Entry>(entry) });
      }
    } catch (err) {
      this.emit({
        type: 'log',
        payload: { level: 'error', message: errorMessage(err) },
      });
    }
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadRuntime();
    }

    return this.loadPromise;
  }

  private async loadRuntime() {
    if (typeof walletdkCall() === 'function') {
      return;
    }

    const base = this.runtimeBaseUrl;
    await loadScript(resolveRuntimeAsset(base, RUNTIME_ASSETS.sqliteBridge));
    await loadScript(resolveRuntimeAsset(base, RUNTIME_ASSETS.wasmExec));

    const goCtor = (
      globalThis as typeof globalThis & {
        Go?: new () => {
          importObject: WebAssembly.Imports;
          run(instance: WebAssembly.Instance): Promise<void>;
        };
      }
    ).Go;
    if (!goCtor) {
      throw new WalletDKError('Go WASM runtime did not load');
    }

    const go = new goCtor();
    const result = await instantiateWasm(go.importObject, base);
    const runPromise = go.run(result.instance);

    // If the runtime exits (resolves or rejects) before signaling ready, boot
    // failed; turn that into a rejection so ready()/start() do not hang forever
    // waiting for a 'walletdk-ready' event that will never fire.
    let ready = false;
    const bootExit = runPromise.then(
      () => {
        throw new WalletDKError(
          'walletdk runtime exited before signaling ready',
          'runtime_not_ready',
        );
      },
      (err) => {
        throw new WalletDKError(errorMessage(err), 'runtime_not_ready', {
          cause: err,
        });
      },
    );
    // A runtime that exits after ready is surfaced as an error log instead, so
    // the rejection is always handled (never unhandled) either way.
    bootExit.catch((err) => {
      if (ready) {
        this.emit({
          type: 'log',
          payload: { level: 'error', message: errorMessage(err) },
        });
      }
    });

    await Promise.race([waitForReadyEvent(), bootExit]);
    ready = true;
  }
}

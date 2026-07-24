import {
  BaseWavelengthClient,
  WavelengthError,
} from '@lightninglabs/wavelength-core';
import type {
  ActivityStreamOptions,
  FacadeMethod,
  WavelengthPerformanceListener,
} from '@lightninglabs/wavelength-core';
import { RUNTIME_ASSETS } from '../runtime-manifest.ts';
import type { WebClientOptions } from '../index.ts';
import {
  instantiateWasm,
  loadScript,
  resolveRuntimeAsset,
  waitForReadyEvent,
  wavewalletdkCall,
} from '../runtime.ts';
import { ActivityHandle, debugTs, errorMessage } from '../util.ts';
import { performanceNow, reportPerformance } from '../performance.ts';

type ActivityOpen = {
  generation: number;
  promise: Promise<void>;
};

/**
 * Runs the wasm runtime on the page's main thread. It is the escape hatch for
 * environments without Web Worker support (or where main-thread execution is
 * preferred); select it via createWebClient({ runtimeThread: 'main' }). Unlike
 * worker mode it blocks rendering while the runtime is busy.
 */
export class MainThreadWavelengthClient extends BaseWavelengthClient {
  protected readonly serverTransport = 'rest' as const;
  private loadPromise: Promise<void> | null = null;
  private activityHandle: ActivityHandle | null = null;
  private activityOpen: ActivityOpen | null = null;
  private activityGeneration = 0;
  private readonly runtimeBaseUrl: string | undefined;
  private readonly debug: boolean;
  private readonly onPerformance: WavelengthPerformanceListener | undefined;
  private readonly onRuntimeReady = () => this.emit({ type: 'runtimeReady' });

  constructor(options: WebClientOptions = {}) {
    super();
    this.runtimeBaseUrl = options.runtimeBaseUrl;
    this.debug = options.debug ?? false;
    this.onPerformance = options.onPerformance;
    // The runtime fires 'wavewalletdk-ready' once; keep the handler reference
    // so dispose() can detach it if the client is torn down before it fires.
    globalThis.addEventListener('wavewalletdk-ready', this.onRuntimeReady, {
      once: true,
    });
  }

  dispose(): void {
    super.dispose();
    globalThis.removeEventListener('wavewalletdk-ready', this.onRuntimeReady);
  }

  ready(): Promise<void> {
    return this.ensureLoaded();
  }

  protected async invokeFacade<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    await this.ensureLoaded();

    const globalWallet = globalThis as typeof globalThis & {
      wavewalletdkCall?: (method: string, params?: unknown) => Promise<T>;
    };

    if (typeof globalWallet.wavewalletdkCall !== 'function') {
      throw new WavelengthError(
        'Wavelength wasm runtime is not ready',
        'runtime_not_ready',
      );
    }

    try {
      if (this.debug) {
        console.log(`${debugTs()} Executing ${method}:`, params);
      }
      const result = await globalWallet.wavewalletdkCall(method, params);
      if (this.debug) {
        console.log(`${debugTs()} Executed ${method} result:`, result);
      }

      return result;
    } catch (err) {
      throw new WavelengthError(errorMessage(err), 'wavelength_error', {
        cause: err,
      });
    }
  }

  // startActivity opens the facade's pull-based activity stream and pumps each
  // entry to subscribers as an 'activity' event. The old bridge pushed a
  // 'wavewalletdk-activity' DOM event; the wasm bridge hands back a
  // subscription handle instead, so the client drives the loop. Idempotent: a
  // second call while a stream is open is a no-op.
  protected async openActivityStream(
    opts: ActivityStreamOptions,
  ): Promise<void> {
    await this.ensureLoaded();
    if (this.activityHandle) {
      return;
    }
    const generation = this.activityGeneration;
    const pending = this.activityOpen;
    if (pending?.generation === generation) {
      await pending.promise;

      return;
    }

    const call = wavewalletdkCall();
    if (typeof call !== 'function') {
      throw new WavelengthError(
        'Wavelength wasm runtime is not ready',
        'runtime_not_ready',
      );
    }

    const request = {
      includeExisting: opts.includeExisting ?? false,
      kinds: opts.kinds ?? [],
      cursor: opts.cursor ?? 0,
    };
    let open!: ActivityOpen;
    const promise = call('subscribe', request)
      .then((handle) => {
        const activityHandle = handle as ActivityHandle;
        if (this.activityGeneration !== generation) {
          activityHandle.close();

          return;
        }
        this.activityHandle = activityHandle;
        void this.pumpActivity(activityHandle);
      })
      .finally(() => {
        if (this.activityOpen === open) {
          this.activityOpen = null;
        }
      });
    open = { generation, promise };
    this.activityOpen = open;

    await promise;
  }

  stopActivity(): void {
    this.activityGeneration += 1;
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
        this.emit({
          type: 'activity',
          payload: this.normalizeActivityEntry(entry),
        });
      }
      // A stream that ends while this is still the active handle was not
      // closed by stopActivity; signal it so the host can resubscribe. A
      // handle swapped out by stopActivity is an expected close and is silent.
      if (this.activityHandle === handle) {
        this.activityHandle = null;
        this.emit({ type: 'activityStream', payload: { state: 'ended' } });
      }
    } catch (err) {
      // An error after a client-initiated close is expected; only surface a
      // failure the consumer did not cause.
      if (this.activityHandle === handle) {
        this.activityHandle = null;
        this.emit({
          type: 'activityStream',
          payload: { state: 'failed', message: errorMessage(err) },
        });
      }
    }
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadRuntime();
    }

    return this.loadPromise;
  }

  private async loadRuntime() {
    if (typeof wavewalletdkCall() === 'function') {
      return;
    }

    const base = this.runtimeBaseUrl;
    const sqliteStartedAt = this.onPerformance ? performanceNow() : undefined;
    await loadScript(resolveRuntimeAsset(base, RUNTIME_ASSETS.sqliteBridge));
    if (sqliteStartedAt !== undefined) {
      reportPerformance(this.onPerformance, {
        stage: 'runtime',
        phase: 'sqliteBridgeScript',
        durationMs: performanceNow() - sqliteStartedAt,
        detail: { transport: 'main' },
      });
    }
    const goScriptStartedAt = this.onPerformance ? performanceNow() : undefined;
    await loadScript(resolveRuntimeAsset(base, RUNTIME_ASSETS.wasmExec));
    if (goScriptStartedAt !== undefined) {
      reportPerformance(this.onPerformance, {
        stage: 'runtime',
        phase: 'wasmExecScript',
        durationMs: performanceNow() - goScriptStartedAt,
        detail: { transport: 'main' },
      });
    }

    const goCtor = (
      globalThis as typeof globalThis & {
        Go?: new () => {
          importObject: WebAssembly.Imports;
          run(instance: WebAssembly.Instance): Promise<void>;
        };
      }
    ).Go;
    if (!goCtor) {
      throw new WavelengthError('Go WASM runtime did not load');
    }

    const go = new goCtor();
    const result = await instantiateWasm(
      go.importObject,
      base,
      this.onPerformance,
    );
    const goReadyStartedAt = this.onPerformance ? performanceNow() : undefined;
    const runPromise = go.run(result.instance);

    // If the runtime exits (resolves or rejects) before signaling ready, boot
    // failed; turn that into a rejection so ready()/start() do not hang forever
    // waiting for a 'wavewalletdk-ready' event that will never fire.
    let ready = false;
    const bootExit = runPromise.then(
      () => {
        throw new WavelengthError(
          'Wavelength runtime exited before signaling ready',
          'runtime_not_ready',
        );
      },
      (err) => {
        throw new WavelengthError(errorMessage(err), 'runtime_not_ready', {
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
    if (goReadyStartedAt !== undefined) {
      reportPerformance(this.onPerformance, {
        stage: 'runtime',
        phase: 'goReady',
        durationMs: performanceNow() - goReadyStartedAt,
        detail: { transport: 'main' },
      });
    }
    ready = true;
  }
}

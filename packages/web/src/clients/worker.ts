import {
  BaseWavelengthClient,
  WavelengthError,
  WavelengthEventType,
} from '@lightninglabs/wavelength-core';
import type {
  ActivityStreamOptions,
  FacadeMethod,
} from '@lightninglabs/wavelength-core';
import type { WebClientOptions } from '../index.ts';
import { defaultWorkerRuntimeBaseUrl } from '../runtime.ts';
import { PendingCall, errorMessage, toWavelengthEvent } from '../util.ts';
import { WorkerRuntimeLock } from './runtime-lock.ts';

type WorkerControlMethod = '$ready' | '$startActivity' | '$stopActivity';

/**
 * Runs the wasm runtime in a dedicated Web Worker to keep the UI thread free. It
 * is the default transport; the class is not exported directly, so select it via
 * createWebClient() (or pass runtimeThread: 'main' for the main-thread escape
 * hatch). Worker mode needs a daemon that stores the encrypted seed in OPFS
 * rather than localStorage (which is window-only and absent in Workers); the
 * shipped daemon does, as of lightninglabs/wavelength#811.
 */
export class WorkerWavelengthClient extends BaseWavelengthClient {
  protected readonly serverTransport = 'rest' as const;
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingCall>();
  private readonly runtimeLock = new WorkerRuntimeLock();
  private lifecycleTail: Promise<void> = Promise.resolve();
  private nextRequestID = 1;
  private disposed = false;

  constructor(options: WebClientOptions = {}) {
    super();
    const base = options.runtimeBaseUrl || defaultWorkerRuntimeBaseUrl();
    // The worker ships inside the package. new URL(..., import.meta.url) lets the
    // consumer's bundler emit and fingerprint it, so it versions with the SDK and
    // needs no separate hosting; only the daemon binaries live at runtimeBaseUrl.
    // A caller may still override with an explicitly hosted workerURL.
    this.worker = options.workerURL
      ? new Worker(options.workerURL)
      : new Worker(new URL('../wavewalletdk-worker.js', import.meta.url));
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      this.rejectAll(
        new WavelengthError(
          event.message || 'Wavelength worker error',
          'worker_error',
        ),
      );
    };

    // Hand the runtime base URL (and debug flag) to the worker before any RPC;
    // the fingerprinted worker URL can't carry them as query params, so they
    // arrive as the first message (see the worker's $init handler).
    this.worker.postMessage({
      $init: { runtimeBaseUrl: base, debug: options.debug ?? false },
    });
  }

  ready(): Promise<void> {
    return this.request('$ready').then(() => undefined);
  }

  protected invokeFacade<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    if (method === 'start') {
      return this.startRuntime(params) as Promise<T>;
    }
    if (method === 'stop') {
      return this.stopRuntime(params) as Promise<T>;
    }

    return this.request<T>(method, params);
  }

  private startRuntime(params: unknown): Promise<unknown> {
    return this.enqueueLifecycle(() => this.dispatchStart(params));
  }

  private async dispatchStart(params: unknown): Promise<unknown> {
    this.assertNotDisposed();
    const lockAcquiredForStart = await this.runtimeLock.acquire();
    try {
      this.assertNotDisposed();

      return await this.request('start', params);
    } catch (err) {
      // A rejected start facade request means the daemon never completed
      // startup. Release only when this call acquired the lock: a repeated
      // start against an already-running daemon must not unlock its existing
      // storage ownership. This catch runs before BaseWavelengthClient's
      // separate post-start getInfo request.
      if (lockAcquiredForStart) {
        this.runtimeLock.release();
      }
      throw err;
    }
  }

  private stopRuntime(params: unknown): Promise<unknown> {
    return this.enqueueLifecycle(() => this.dispatchStop(params));
  }

  private async dispatchStop(params: unknown): Promise<unknown> {
    this.assertNotDisposed();
    const result = await this.request('stop', params);
    // A failed stop may leave the daemon's OPFS handles alive, so release only
    // after the facade confirms the runtime stopped.
    this.runtimeLock.release();

    return result;
  }

  private enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const request = this.lifecycleTail.then(operation, operation);
    this.lifecycleTail = request.then(
      () => undefined,
      () => undefined,
    );

    return request;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new WavelengthError('Wavelength client disposed', 'worker_error');
    }
  }

  private request<T = unknown>(
    method: FacadeMethod | WorkerControlMethod,
    params: unknown = {},
  ): Promise<T> {
    const id = this.nextRequestID++;

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });

    this.worker.postMessage({ id, method, params });

    return promise;
  }

  // startActivity asks the worker to open the activity stream. The wasm bridge's
  // subscription handle holds JS callbacks that cannot cross postMessage, so the
  // worker drives the pull loop and forwards each entry as an 'activity' event
  // message instead of returning the handle.
  protected async openActivityStream(
    opts: ActivityStreamOptions,
  ): Promise<void> {
    const request = {
      includeExisting: opts.includeExisting ?? false,
      kinds: opts.kinds ?? [],
      cursor: opts.cursor ?? 0,
    };
    await this.request('$startActivity', request);
  }

  stopActivity(): void {
    void this.request('$stopActivity').catch((err) => {
      this.emit({
        type: 'log',
        payload: {
          level: 'warn',
          message: `failed to close the activity stream: ${errorMessage(err)}`,
        },
      });
    });
  }

  private handleMessage(message: unknown) {
    if (!message || typeof message !== 'object') {
      return;
    }

    const data = message as {
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      event?: { type: WavelengthEventType; payload?: unknown };
      fatal?: { message?: string };
    };

    if (data.fatal) {
      // The worker's runtime exited; fail every in-flight call so callers do
      // not hang, and emit runtimeStopped so subscribers (e.g. the provider)
      // move the lifecycle off 'ready' instead of appearing alive after the
      // engine died.
      this.runtimeLock.release();
      this.rejectAll(
        new WavelengthError(
          data.fatal.message || 'Wavelength worker stopped',
          'worker_error',
        ),
      );
      this.emit({ type: 'runtimeStopped' });

      return;
    }

    if (data.event) {
      if (data.event.type === 'activity') {
        this.emit({
          type: 'activity',
          payload: this.normalizeActivityEntry(data.event.payload),
        });

        return;
      }

      // Map lifecycle, log, and terminal events separately from daemon entries.
      this.emit(toWavelengthEvent(data.event));

      return;
    }

    if (typeof data.id !== 'number') {
      return;
    }

    const pending = this.pending.get(data.id);
    if (!pending) {
      return;
    }
    this.pending.delete(data.id);

    if (data.ok) {
      pending.resolve(data.result);

      return;
    }

    pending.reject(new WavelengthError(data.error || 'Wavelength request failed'));
  }

  private rejectAll(err: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(err);
    }
    this.pending.clear();
  }

  dispose(): void {
    this.disposed = true;
    super.dispose();
    // Terminating the worker fires neither onerror nor a fatal message, so
    // reject any in-flight calls here so they do not hang past disposal.
    this.rejectAll(
      new WavelengthError('Wavelength client disposed', 'worker_error'),
    );
    this.runtimeLock.dispose();
    this.worker.terminate();
  }
}

import {
  BaseWavelengthClient,
  WavelengthError,
  WavelengthEventType,
} from '@lightninglabs/wavelength-core';
import type {
  ActivityStreamOptions,
  FacadeMethod,
} from '@lightninglabs/wavelength-core';
import type { WebClientOptions } from '../index';
import { defaultWorkerRuntimeBaseUrl } from '../runtime';
import { PendingCall, toWavelengthEvent } from '../util';

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
  private nextRequestID = 1;

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
    return this.request<T>(method, params);
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
    void this.request('$stopActivity').catch(() => undefined);
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
      // Map the worker's raw event onto the typed union, camelizing payloads
      // that carry daemon JSON (e.g. an 'activity' Entry) so stream consumers see
      // the same camelCase shapes as the typed responses.
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
    super.dispose();
    // Terminating the worker fires neither onerror nor a fatal message, so
    // reject any in-flight calls here so they do not hang past disposal.
    this.rejectAll(
      new WavelengthError('Wavelength client disposed', 'worker_error'),
    );
    this.worker.terminate();
  }
}

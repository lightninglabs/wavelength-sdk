import {
  BaseWavelengthClient,
  WavelengthError,
  WavelengthEventType,
  validateRuntimeConfig,
} from '@lightninglabs/wavelength-core';
import type {
  ActivityStreamOptions,
  FacadeMethod,
  RuntimeConfig,
  WalletInfo,
} from '@lightninglabs/wavelength-core';
import type { WavelengthErrorCode } from '@lightninglabs/wavelength-core';
import type { WebClientOptions } from '../index.ts';
import {
  defaultWorkerRuntimeBaseUrl,
  isRuntimeAssetMessage,
} from '../runtime.ts';
import {
  RuntimeLock,
  NO_RUNTIME_LEASE,
  isNearMissLockMessage,
  isWalletLockedMessage,
} from '../runtime-lock.ts';
import type { RuntimeLockLease } from '../runtime-lock.ts';
import { PendingCall, errorMessage, toWavelengthEvent } from '../util.ts';

type WorkerControlMethod = '$ready' | '$startActivity' | '$stopActivity';

// workerErrorCode classifies a raw failure string from the worker. The worker
// cannot send a code across postMessage, so the text is all the client has.
// The wallet_locked mapping is gated to the start verb: cross-context OPFS
// contention only happens when a runtime opens the databases, so a matching
// message on any other verb is same-runtime transient contention and must not
// tell a sole tab to close a window that does not exist.
function workerErrorCode(message: string, method: string): WavelengthErrorCode {
  if (method === 'start' && isWalletLockedMessage(message)) {
    return 'wallet_locked';
  }
  if (isRuntimeAssetMessage(message)) {
    return 'asset_load_failed';
  }

  return 'wavelength_error';
}

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
  private worker: Worker;
  private readonly pending = new Map<
    number,
    PendingCall & { method: FacadeMethod | WorkerControlMethod }
  >();
  private readonly lock = new RuntimeLock({
    onWarn: (message) =>
      this.emit({ type: 'log', payload: { level: 'warn', message } }),
  });
  private readonly options: WebClientOptions;
  private nextRequestID = 1;
  // The lease held by the running session, threaded into every teardown so a
  // release only frees the lock when this session still owns it.
  private lease: RuntimeLockLease = NO_RUNTIME_LEASE;
  // Set once the worker's runtime is known to be gone. Requests posted after
  // that are never answered, so anything that would wait on one has to check.
  private runtimeExited = false;
  // Set by dispose(). Distinct from runtimeExited, which dispose() also sets:
  // a runtime that died can be replaced, a disposed client must not be.
  private disposed = false;

  constructor(options: WebClientOptions = {}) {
    super();
    this.options = options;
    this.worker = this.spawnWorker();
  }

  // spawnWorker builds a worker and hands it the runtime base URL. A Go
  // runtime that has exited cannot be restarted inside its worker (the
  // worker's load state is terminal), so a retry after the runtime dies needs
  // a whole new one; keeping this in a method is what makes that possible.
  private spawnWorker(): Worker {
    const options = this.options;
    const base = options.runtimeBaseUrl || defaultWorkerRuntimeBaseUrl();
    // The worker ships inside the package. new URL(..., import.meta.url) lets the
    // consumer's bundler emit and fingerprint it, so it versions with the SDK and
    // needs no separate hosting; only the daemon binaries live at runtimeBaseUrl.
    // A caller may still override with an explicitly hosted workerURL.
    const worker = options.workerURL
      ? new Worker(options.workerURL)
      : new Worker(new URL('../wavewalletdk-worker.js', import.meta.url));
    worker.onmessage = (event) => this.handleMessage(event.data, worker);
    worker.onerror = (event) => {
      // A worker that throws is abandoned like any other dead runtime: kill it
      // (which frees the OPFS handles) and tell the host the runtime is gone.
      // killWorker takes the worker so a late error from a worker a retry has
      // already replaced tears down nothing; the stop is likewise announced
      // only while this worker is still current, so a stale stop cannot knock
      // the live replacement onto the stopped screen.
      if (this.killWorker(worker, new WavelengthError(
        event.message || 'Wavelength worker error',
        'worker_error',
      ))) {
        this.announceRuntimeStopped(worker);
      }
    };

    // Hand the runtime base URL (and debug flag) to the worker before any RPC;
    // the fingerprinted worker URL can't carry them as query params, so they
    // arrive as the first message (see the worker's $init handler).
    worker.postMessage({
      $init: { runtimeBaseUrl: base, debug: options.debug ?? false },
    });
    this.runtimeExited = false;

    return worker;
  }

  // replaceWorker discards a worker whose runtime has exited and stands up a
  // replacement, so a host retrying after a fatal (the demo's Try again, for
  // one) reaches a runtime that can actually boot.
  private replaceWorker(): void {
    // Anything still queued belongs to the worker about to be terminated and
    // would never be answered, so fail it here rather than leaving a promise
    // pending forever.
    this.rejectAll(
      new WavelengthError(
        'Wavelength runtime was replaced after it exited',
        'worker_error',
      ),
    );
    this.worker.terminate();
    this.worker = this.spawnWorker();
  }

  // killWorker ends `worker` and reports whether this call is the one that did
  // it. It acts only while `worker` is still the current one, so a late event
  // from a worker a retry already replaced cannot terminate the replacement.
  // Terminating the worker takes its nested SQLite worker with it, freeing the
  // OPFS access handles the daemon may have opened. Idempotent, since a runtime
  // can die and error in the same breath; the boolean lets callers announce the
  // stop exactly once, and the next start() respawns. Releasing the lock is left
  // to the caller, which knows the session's lease.
  private killWorker(worker: Worker, reason: WavelengthError): boolean {
    if (worker !== this.worker || this.runtimeExited) {
      return false;
    }
    this.runtimeExited = true;
    this.rejectAll(reason);
    this.worker.terminate();

    return true;
  }

  // announceRuntimeStopped releases the session lock and tells the host the
  // runtime is gone, in that order so a subscriber that restarts on the event
  // finds the lock free. The release is scoped to this session's lease, so a
  // retry that has already taken a fresh lease keeps its lock; the emit is
  // gated on `worker` still being current for the same reason.
  private announceRuntimeStopped(worker: Worker): void {
    const lease = this.lease;
    void this.lock.releaseAndSettle(lease).then(() => {
      if (this.worker === worker) {
        this.emit({ type: 'runtimeStopped' });
      }
    });
  }

  ready(): Promise<void> {
    return this.request('$ready').then(() => undefined);
  }

  // start and stop are serialized against each other so a host's overlapping
  // calls cannot interleave at the lock: two starts would otherwise share one
  // lease, and a stop could release the lock while a start is still opening the
  // databases.
  start(config: RuntimeConfig): Promise<WalletInfo> {
    return this.enqueueLifecycle(() => this.startLocked(config));
  }

  stop(): Promise<void> {
    return this.enqueueLifecycle(() =>
      // A stop that ran behind a start which then died (or any path that
      // already set runtimeExited) has nothing to stop: the death released the
      // lock and announced the stop. Own the shutdown as satisfied rather than
      // rejecting super.stop() against the dead worker's request guard.
      this.runtimeExited ? Promise.resolve() : super.stop(),
    );
  }

  // startLocked is the serialized body of start(). It is the verb that opens the
  // daemon's exclusive OPFS databases, so it is where the cross-tab runtime lock
  // is taken: a second tab fails fast with wallet_locked instead of tripping
  // over SQLite handles held by the first. Validation runs first so a config
  // that can never reach the daemon does not take the lock at all.
  private async startLocked(config: RuntimeConfig): Promise<WalletInfo> {
    validateRuntimeConfig(config, this.serverTransport);
    if (this.disposed) {
      throw new WavelengthError('Wavelength client disposed', 'worker_error');
    }
    // A previous runtime that exited leaves its worker unable to boot another,
    // so a retry gets a fresh one rather than failing against the corpse.
    if (this.runtimeExited) {
      this.replaceWorker();
    }
    // A redundant start on an already-running session (the double click
    // enqueueLifecycle serializes, or any host that starts twice) coalesces
    // rather than re-invoking the daemon. By here the lock is held and the
    // runtime is up, so re-running super.start() would risk a daemon "already
    // started" or a transient getInfo() rejection, whose teardown would kill
    // the live worker and free the cross-tab lock for other tabs. Return the
    // current info instead, leaving the session and its lock intact. To start
    // under a different config, stop() first.
    if (this.lock.held) {
      return this.getInfo();
    }
    this.lease = await this.lock.acquire();
    // acquire() yields even when it resolves immediately (no Web Locks), so a
    // dispose() issued in the same turn can land here. Bail before booting a
    // daemon into a client nobody can drive, releasing the lock we just took.
    if (this.disposed) {
      this.killWorker(
        this.worker,
        new WavelengthError('Wavelength client disposed', 'worker_error'),
      );
      await this.lock.releaseAndSettle(this.lease);

      throw new WavelengthError('Wavelength client disposed', 'worker_error');
    }
    // The worker can also die during that same acquire window (an onerror while
    // suspended here). killWorker already ran with a stale lease (this.lease was
    // still NO_RUNTIME_LEASE when it fired), so its release was a no-op; release
    // the grant we now hold rather than strand the origin behind a dead runtime.
    // The fatal/onerror path has already announced the stop.
    if (this.runtimeExited) {
      await this.lock.releaseAndSettle(this.lease);

      throw new WavelengthError(
        'Wavelength runtime exited during start',
        'worker_error',
      );
    }

    try {
      return await super.start(config);
    } catch (err) {
      // Any failed start abandons the worker. Killing it frees any OPFS handles
      // the start opened before failing, and the next start gets a fresh
      // runtime. Tearing down rather than classifying the error is what keeps
      // any failure shape (a bootstrap asset error, a runtime that exited
      // without a message) from leaving a wedged runtime behind.
      const killed = this.killWorker(
        this.worker,
        err instanceof WavelengthError
          ? err
          : new WavelengthError(errorMessage(err), 'worker_error'),
      );
      // Every dead-runtime path announces the stop (see the fatal handler); a
      // start that killed its worker is no exception, or a host keying liveness
      // off runtimeStopped would think this runtime is still up. Release the
      // session lock first, then announce, so a restart on the event finds it
      // free. When the fatal handler got there first, killWorker returns false.
      if (killed) {
        await this.lock.releaseAndSettle(this.lease);
        this.emit({ type: 'runtimeStopped' });
      }

      throw err;
    }
  }

  protected beforeDaemonStop(): unknown {
    // Capture the running session's lease before the stop RPC, so the release
    // below frees this session's lock even if a new start takes over while the
    // stop is in flight.
    return this.lease;
  }

  // Called once the daemon acknowledges a stop, which is the proof its
  // databases are closed and another tab may take the wallet over. Releases the
  // lease this stop captured, not whatever the lock currently holds, so a stop
  // whose start has already been superseded frees nothing.
  protected async afterDaemonStopped(token?: unknown): Promise<void> {
    await this.lock.releaseAndSettle(token as RuntimeLockLease);
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
    // A terminated worker answers nothing, so a call posted to it would
    // register a promise that never settles. start() is the one caller that
    // may proceed past a dead runtime, and it does so by replacing the worker
    // (which clears runtimeExited) before issuing any request.
    if (this.runtimeExited || this.disposed) {
      return Promise.reject(
        new WavelengthError(
          this.disposed
            ? 'Wavelength client disposed'
            : 'Wavelength runtime has exited; call start() to boot a new one',
          'worker_error',
        ),
      );
    }
    const id = this.nextRequestID++;

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        method,
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
    // A dead or disposed runtime has no activity stream to close, and request()
    // would reject against its dead-runtime guard. The engine reconciles
    // processes on every runtimeStopped, so without this every crash emits a
    // spurious warn that competes with the genuine near-miss drift warnings on
    // the same channel. Own the close as satisfied.
    if (this.runtimeExited || this.disposed) {
      return;
    }
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

  private handleMessage(message: unknown, sourceWorker: Worker) {
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
      // The worker's runtime exited. Kill the worker to free its OPFS handles,
      // failing every in-flight call so callers do not hang. A death caused by
      // the wallet database being held in another browser context carries the
      // wallet_locked code so consumers can show an actionable message.
      //
      // runtimeStopped's order against the rejections above is deliberately
      // free, in both directions, because the engine's phase machine lets an
      // error outrank the stop that caused it (machine.ts runtimeStopped). Keep
      // it free of any ordering requirement: pinning either order breaks a case
      // the other serves, and the phase machine is what makes pinning
      // unnecessary. The release-before-announce ordering (announceRuntimeStopped)
      // is the one guarantee that does hold, so a restart finds the lock free.
      const message = data.fatal.message || 'Wavelength worker stopped';
      // Use the worker the message came from, not this.worker: a retry can have
      // swapped in a replacement, and a stale fatal from the dead worker must
      // not tear the replacement down. Matches the onerror guard.
      const deadWorker = sourceWorker;
      if (this.killWorker(deadWorker, new WavelengthError(
        message,
        isWalletLockedMessage(message) ? 'wallet_locked' : 'worker_error',
      ))) {
        this.announceRuntimeStopped(deadWorker);
      }

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

    // A daemon call can fail on the locked wallet database without killing the
    // worker (a start that gives up while another context holds the OPFS
    // handles), so classify these the same way the fatal path does. An asset
    // failure is worth its own code too: it means the runtime never loaded, so
    // no daemon can be holding anything.
    const error = data.error || 'Wavelength request failed';
    this.logNearMissLock(error);
    pending.reject(
      new WavelengthError(error, workerErrorCode(error, pending.method)),
    );
  }

  // logNearMissLock surfaces a failure that mentions storage or locking but did
  // not classify as wallet_locked. If the daemon ever rewords a contention
  // error, this is what makes the silent downgrade visible instead of leaving
  // the host to wonder why the multi-tab advice stopped appearing. It warns
  // rather than whispers: this is the only drift signal there is, and a level
  // most hosts filter out cannot do that job. isNearMissLockMessage already
  // excludes routine wallet-unlock prose, so the false-positive cost is a warn
  // on genuine storage failures a host is surfacing anyway.
  private logNearMissLock(message: string): void {
    if (!isNearMissLockMessage(message)) {
      return;
    }
    const warning =
      'a runtime failure mentioned storage or locking but was not ' +
      `classified as wallet_locked: ${message}`;
    // Both channels, matching warnNoWebLocks: this near-miss is the only signal
    // that the daemon reworded a contention string, and a consumer driving the
    // bare client may have no log subscriber, so it is too important to lose to
    // an empty listener set.
    this.emit({ type: 'log', payload: { level: 'warn', message: warning } });
    console.warn(warning);
  }

  private rejectAll(err: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(err);
    }
    this.pending.clear();
  }

  dispose(): void {
    super.dispose();
    this.disposed = true;
    // killWorker rejects in-flight calls and terminates the worker (which frees
    // the OPFS handles); releasing the session lease hands the lock back. This
    // mirrors the other dead-runtime paths but for one step: it does not emit
    // runtimeStopped, because super.dispose() has already cleared the listeners
    // that event would reach. disposed stays set so a start() racing this cannot
    // resurrect the client by spawning a new worker.
    if (this.killWorker(
      this.worker,
      new WavelengthError('Wavelength client disposed', 'worker_error'),
    )) {
      void this.lock.releaseAndSettle(this.lease);
    }
  }
}

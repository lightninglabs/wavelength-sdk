import {
  BaseWavelengthClient,
  WavelengthError,
  validateRuntimeConfig,
} from '@lightninglabs/wavelength-core';
import type {
  ActivityStreamOptions,
  FacadeMethod,
  RuntimeConfig,
  WalletInfo,
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
import {
  RuntimeLock,
  NO_RUNTIME_LEASE,
  isNearMissLockMessage,
  isWalletLockedMessage,
} from '../runtime-lock.ts';
import type { RuntimeLockLease } from '../runtime-lock.ts';
import { ActivityHandle, debugTs, errorMessage } from '../util.ts';

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
  private readonly lock = new RuntimeLock({
    onWarn: (message) =>
      this.emit({ type: 'log', payload: { level: 'warn', message } }),
  });
  // The lease held by the running session, threaded into every release so a
  // release only frees the lock when this session still owns it.
  private lease: RuntimeLockLease = NO_RUNTIME_LEASE;
  // Set once the wasm runtime is known to have exited. Calls made after that
  // cannot be answered, so anything that would wait on one has to check.
  private runtimeExited = false;
  // Set by dispose(). A disposed client must not boot a daemon it can no longer
  // drive, so start() checks this after acquiring the lock.
  private disposed = false;
  private readonly runtimeBaseUrl: string | undefined;
  private readonly debug: boolean;
  private readonly onRuntimeReady = () => this.emit({ type: 'runtimeReady' });

  constructor(options: WebClientOptions = {}) {
    super();
    this.runtimeBaseUrl = options.runtimeBaseUrl;
    this.debug = options.debug ?? false;
    // The runtime fires 'wavewalletdk-ready' once; keep the handler reference
    // so dispose() can detach it if the client is torn down before it fires.
    globalThis.addEventListener('wavewalletdk-ready', this.onRuntimeReady, {
      once: true,
    });
  }

  dispose(): void {
    super.dispose();
    this.disposed = true;
    globalThis.removeEventListener('wavewalletdk-ready', this.onRuntimeReady);
    // The runtime lock is deliberately not released here. Disposing drops this
    // client's listeners but cannot stop a Go runtime already running on the
    // page, so the daemon may still own the wallet databases; releasing would
    // let another tab open them underneath it. A clean stop(), the runtime
    // exiting, or the page going away are the paths that prove it is down.
  }

  ready(): Promise<void> {
    return this.ensureLoaded();
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
      // A stop after the runtime has exited has nothing to stop: bootExit
      // already released the lock and announced the stop. Own the shutdown as
      // satisfied rather than call super.stop(), which would run
      // wavewalletdkCall('stop') against a dead bridge (Go leaves it installed
      // after exit) and hang or reject instead of resolving. Mirrors the worker
      // transport's stop() guard.
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
      throw new WavelengthError('Wavelength client disposed', 'wavelength_error');
    }
    // A Go runtime that exited cannot be restarted on the page (unlike the
    // worker transport, which respawns its worker), so fail fast rather than
    // acquiring a lock for a bridge that answers nothing.
    if (this.runtimeExited) {
      throw new WavelengthError(
        'The Wavelength main-thread runtime has exited and cannot be ' +
          'restarted in this page; reload the page to start again',
        'runtime_not_ready',
      );
    }
    // A redundant start on an already-running session (the double click
    // enqueueLifecycle serializes, or any host that starts twice) coalesces
    // rather than re-invoking the daemon. By here the lock is held and the
    // runtime is up, so re-running super.start() would risk a daemon "already
    // started" or a transient getInfo() rejection, whose recovery stop would
    // tear the live session down and free the cross-tab lock for other tabs.
    // Return the current info instead, leaving the session and its lock
    // intact. To start under a different config, stop() first.
    if (this.lock.held) {
      return this.getInfo();
    }
    this.lease = await this.lock.acquire();
    // acquire() yields even when it resolves immediately (no Web Locks), so a
    // dispose() issued in the same turn can land here. Bail before booting a
    // daemon into a disposed client. super.start() has not run, so no daemon
    // opened a database whatever the runtime's load state, and the lock this
    // attempt took is released unconditionally rather than stranded for the
    // life of the page.
    if (this.disposed) {
      await this.lock.releaseAndSettle(this.lease);

      throw new WavelengthError('Wavelength client disposed', 'wavelength_error');
    }
    // The runtime can also exit during that same acquire window (a go.run()
    // trap while this is suspended). bootExit fires with this.lease still
    // NO_RUNTIME_LEASE, so its release is a no-op; release the grant we now
    // hold rather than strand the origin behind a dead runtime. The catch below
    // cannot cover this: Go leaves wavewalletdkCall installed after it exits, so
    // its function-probe stays true and the runtimeExited branch skips the
    // recovery stop, leaking the lease. Mirrors the worker transport's
    // post-acquire runtimeExited guard.
    if (this.runtimeExited) {
      await this.lock.releaseAndSettle(this.lease);

      throw new WavelengthError(
        'The Wavelength main-thread runtime exited during start',
        'runtime_not_ready',
      );
    }

    try {
      return await super.start(config);
    } catch (err) {
      // super.start() ran, so a callable runtime may have opened the databases.
      // Whether to hand the lock back is decided by probing the runtime, not by
      // classifying the error: classifying by code cannot catch every shape (a
      // missing Go constructor, a fetch or instantiate failure with no code at
      // all), and a shape it misses would strand the lock. If wavewalletdkCall
      // never became a function, the runtime never became callable, so nothing
      // can have opened a database and releasing is safe. This probe is the
      // main-thread stand-in for the worker transport's terminate teardown.
      //
      // A callable runtime may hold the databases, so ask the daemon to stop
      // rather than assume it never ran. A stop it acknowledges releases the
      // lock through afterDaemonStopped; one it does not leaves the lock held,
      // because handing it back unproven is what lets a second daemon open the
      // same databases. The browser reclaims it when this tab goes away. A
      // runtime that already exited is skipped: its own exit handler released
      // the lock, and it answers no further calls.
      if (typeof wavewalletdkCall() !== 'function') {
        await this.lock.releaseAndSettle(this.lease);
      } else if (!this.runtimeExited) {
        // super.stop(), not this.stop(): startLocked already runs inside the
        // lifecycle queue, so the enqueuing stop() override would wait on this
        // very operation and deadlock. This recovery stop is part of the start.
        await super.stop().catch((stopErr) => {
          // The lock is correctly retained here (the stop was not
          // acknowledged, so the daemon may still hold the databases), but this
          // is the one path that leaves the whole origin wallet_locked with no
          // other tab present, and only a page reload clears it. That is an
          // error, not a filterable warning like the recoverable near-miss
          // drift logs: surface it at error level so it is not lost.
          this.emit({
            type: 'log',
            payload: {
              level: 'error',
              message:
                'the wallet runtime lock is retained because a recovery stop ' +
                `failed after a failed start: ${errorMessage(stopErr)}`,
            },
          });
        });
      }

      throw err;
    }
  }

  protected beforeDaemonStop(): unknown {
    // Capture the running session's lease before the stop RPC, so the release
    // frees this session's lock even if a new start takes over meanwhile.
    return this.lease;
  }

  // Called once the daemon acknowledges a stop, which is the proof its
  // databases are closed and another tab may take the wallet over. Releases the
  // lease this stop captured, so a stop whose start has already been superseded
  // frees nothing.
  protected async afterDaemonStopped(token?: unknown): Promise<void> {
    await this.lock.releaseAndSettle(token as RuntimeLockLease);
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
      const message = errorMessage(err);
      this.logNearMissLock(message);
      throw new WavelengthError(
        message,
        // Gated to the start verb: cross-context OPFS contention only happens
        // when a runtime opens the databases, so a matching message on any
        // other verb is same-runtime transient contention, not another tab.
        method === 'start' && isWalletLockedMessage(message)
          ? 'wallet_locked'
          : 'wavelength_error',
        { cause: err },
      );
    }
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
    // close() is a bridge callback that can throw; a throw here (called from
    // dispose() and the engine's process reconcile) would surface as an
    // uncaught exception mid-teardown, so warn instead, matching the worker
    // transport's $stopActivity handling.
    try {
      handle?.close();
    } catch (err) {
      this.emit({
        type: 'log',
        payload: {
          level: 'warn',
          message: `failed to close the activity stream: ${errorMessage(err)}`,
        },
      });
    }
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
      throw new WavelengthError('Go WASM runtime did not load');
    }

    const go = new goCtor();
    const result = await instantiateWasm(go.importObject, base);
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
        const message = errorMessage(err);
        throw new WavelengthError(
          message,
          isWalletLockedMessage(message) ? 'wallet_locked' : 'runtime_not_ready',
          { cause: err },
        );
      },
    );
    // A runtime that exits after ready is surfaced as an error log instead, so
    // the rejection is always handled (never unhandled) either way. A dead
    // runtime no longer holds the wallet databases, so the runtime lock is
    // released either way to let another tab take over. The release is settled
    // before runtimeStopped so a subscriber that restarts on that event finds
    // the lock already free, matching the worker transport's fatal path.
    bootExit.catch(async (err) => {
      this.runtimeExited = true;
      await this.lock.releaseAndSettle(this.lease);
      if (ready) {
        this.emit({
          type: 'log',
          payload: { level: 'error', message: errorMessage(err) },
        });
        // Tell subscribers the runtime is gone, the way the worker transport
        // does from its fatal handler. Without this a host would keep showing
        // a live wallet backed by a runtime that has exited. A runtime that
        // dies before ready is left alone: ready() rejects on its own and the
        // host reports that failure instead.
        this.emit({ type: 'runtimeStopped' });
      }
    });

    await Promise.race([waitForReadyEvent(), bootExit]);
    ready = true;
  }
}

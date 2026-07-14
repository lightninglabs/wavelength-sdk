import type { WavelengthClient } from '../client.ts';
import type { RuntimeConfig } from '../config.ts';
import { toError } from '../errors.ts';
import type { WavelengthEvent } from '../events.ts';
import type {
  CreateWalletRequest,
  DepositRequest,
  OpenWalletFromPasskeyRequest,
  ReceiveRequest,
  RestoreWalletRequest,
  SendRequest,
  UnlockWalletRequest,
} from '../requests.ts';
import type {
  Balance,
  CreateWalletResult,
  DepositResult,
  Entry,
  OpenWalletFromPasskeyResult,
  PrepareSendResult,
  ReceiveResult,
  SendResult,
  UnlockWalletResult,
} from '../results.ts';
import { WalletState, type WalletInfo } from '../state.ts';
import { ActivityStream } from './activity.ts';
import {
  ADOPT_INFO_RETRIES,
  ADOPT_INFO_RETRY_MS,
  BACKGROUND_REFRESH_FAILURE_LIMIT,
  MAX_LOGS,
  RESTORE_POLL_MS,
  SYNC_POLL_FAILURE_LIMIT,
  SYNC_POLL_MS,
} from './constants.ts';
import { transition, type WalletEngineEvent } from './machine.ts';
import { Poller } from './poller.ts';
import { SettleReconciler, type BackgroundRefreshResult } from './reconcile.ts';
import type { WalletSnapshot } from './snapshot.ts';
import { stabilize } from './stabilize.ts';
import { SnapshotStore } from './store.ts';

/**
 * Options for {@link createWalletEngine}. A discriminated union: the type
 * requires config when autoStart is true, so autoStart cannot be set without
 * a config to start from.
 */
export type WalletEngineOptions =
  | {
      /** The transport client the engine drives. */
      client: WavelengthClient;
      /** Default runtime config used by autoStart and by start() with no argument. */
      config: RuntimeConfig;
      /** Start the runtime automatically once it is ready. */
      autoStart: true;
    }
  | {
      /** The transport client the engine drives. */
      client: WavelengthClient;
      /** Default runtime config used by start() with no argument. */
      config?: RuntimeConfig;
      /** Start the runtime automatically once it is ready. Requires config; omit or set false when config is unset. */
      autoStart?: false;
    };

/**
 * Removes a key from every arm of a union type. TypeScript's built-in Omit
 * does not distribute over unions (it flattens to the union of all keys
 * first), which would erase the discriminant on types like
 * {@link WalletEngineOptions}. This distributes the omission per arm instead.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * The headless wallet orchestrator: it owns the lifecycle phase machine, the
 * state snapshot (phase, info, balance, activity, recovery, logs), and the
 * background processes that keep them fresh (activity stream, settle
 * reconcile, syncing poll, restore readiness poll). Framework bindings
 * subscribe via getSnapshot()/subscribe(); vanilla consumers can use it
 * directly. Create one with {@link createWalletEngine} or a transport factory
 * such as createWebWalletEngine.
 */
export interface WalletEngine {
  /** The underlying transport client, as an escape hatch. */
  readonly client: WavelengthClient;
  /** The current immutable state snapshot. */
  getSnapshot(): WalletSnapshot;
  /** Subscribes to snapshot changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Starts the runtime. Falls back to the engine's configured config when
   * called without an argument; throws if neither exists. A failure moves the
   * phase to 'error' and rejects.
   */
  start(config?: RuntimeConfig): Promise<WalletInfo>;
  /** Stops the runtime and clears the in-memory snapshot (info, balance, activity, error); persisted wallet data is untouched. A failure moves the phase to 'error'. */
  stop(): Promise<void>;
  /** Re-fetches info, balance, and activity concurrently. */
  refresh(): Promise<void>;
  /** Creates a new wallet, refetches info, and refreshes in the background. */
  createWallet(req: CreateWalletRequest): Promise<CreateWalletResult>;
  /**
   * Restores a wallet from a mnemonic. Resolves as soon as the restored
   * wallet is usable; the optional server-assisted recovery scan continues in
   * the background, observed through snapshot.recovery. Rejects when the
   * restore fails before the wallet came up, when a restore is already in
   * flight, when req.mnemonic is missing or empty, or if the engine has been
   * disposed.
   */
  restoreWallet(req: RestoreWalletRequest): Promise<WalletInfo>;
  /** Resets snapshot.recovery to idle (e.g. after dismissing a banner). */
  acknowledgeRecovery(): void;
  /** Unlocks an existing wallet, refetches info, and refreshes in the background. */
  unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult>;
  /** Opens the wallet from a passkey PRF output, refetches info, and refreshes in the background. */
  openWalletFromPasskey(
    req: OpenWalletFromPasskeyRequest,
  ): Promise<OpenWalletFromPasskeyResult>;
  /** Requests an on-chain deposit address and refreshes in the background. */
  deposit(req?: DepositRequest): Promise<DepositResult>;
  /** Requests a Lightning receive and refreshes in the background. */
  receive(req: ReceiveRequest): Promise<ReceiveResult>;
  /** Quotes a payment without dispatching it. No refresh: a quote moves no money. */
  prepareSend(req: SendRequest): Promise<PrepareSendResult>;
  /** Dispatches a payment quoted by prepareSend and refreshes in the background. */
  sendPrepared(prepared: PrepareSendResult): Promise<SendResult>;
  /** Sends a payment and refreshes in the background. */
  send(req: SendRequest): Promise<SendResult>;
  /** Clears the buffered log tail. */
  clearLogs(): void;
  /** Tears down subscriptions, polls, and streams. The engine is done after this. */
  dispose(): void;
}

/** Creates a {@link WalletEngine} over any transport client. */
export function createWalletEngine(options: WalletEngineOptions): WalletEngine {
  return new WavelengthEngine(options);
}

class WavelengthEngine implements WalletEngine {
  readonly client: WavelengthClient;
  readonly #store = new SnapshotStore();
  readonly #config: RuntimeConfig | undefined;
  #disposed = false;
  #unsubscribe: (() => void) | undefined;

  // Background refreshes are serialized: two concurrent reads would race on
  // the snapshot, and the slower one would win with the staler data.
  #chain: Promise<unknown> = Promise.resolve();
  #refreshFailures = 0;

  // The background processes the phase machine turns on and off; see #reconcileProcesses.
  readonly #stream: ActivityStream;
  readonly #reconciler: SettleReconciler;
  readonly #syncPoller: Poller;
  readonly #restorePoller: Poller;

  // The pending restore promise, settled exactly once at usability (resolve)
  // or wallet-down failure (reject).
  #restore:
    | {
        resolve: (info: WalletInfo) => void;
        reject: (error: Error) => void;
        settled: boolean;
      }
    | undefined;

  constructor(options: WalletEngineOptions) {
    this.client = options.client;
    this.#config = options.config;

    this.#stream = new ActivityStream({
      client: this.client,
      onActivity: () => this.#reconciler.trigger(),
      onReconcile: () => this.#reconciler.trigger(),
      onDead: (error) => {
        // A stream death that lands after the phase has already left 'ready'
        // (for example while stopping) would otherwise stamp a fatal error
        // onto a snapshot the wallet is no longer claiming is live, so only
        // dispatch while the phase is actually 'ready'.
        if (this.getSnapshot().phase === 'ready') {
          this.#dispatch({ type: 'streamLost' }, { error });
        }
      },
    });
    this.#reconciler = new SettleReconciler({
      refresh: () => this.#backgroundRefresh(),
      baseline: () => this.getSnapshot().balance,
    });
    this.#syncPoller = new Poller({
      intervalMs: SYNC_POLL_MS,
      failureLimit: SYNC_POLL_FAILURE_LIMIT,
      tick: () => this.refresh(),
      onExhausted: (err) => {
        // A poller tick already in flight when the poller stops can resolve
        // after the phase has left 'syncing', so only dispatch while the
        // phase is actually 'syncing'; otherwise this would stamp a fatal
        // error onto a healthy or stopped snapshot.
        if (this.getSnapshot().phase === 'syncing') {
          this.#dispatch({ type: 'syncPollExhausted' }, { error: toError(err) });
        }
      },
    });
    this.#restorePoller = new Poller({
      intervalMs: RESTORE_POLL_MS,
      immediate: true,
      tick: () => this.#restoreTick(),
    });

    this.client.ready().then(
      () => {
        if (this.#disposed) {
          return;
        }
        this.#dispatch({ type: 'runtimeReady' });
        if (options.autoStart && this.#config) {
          // Failures surface through the startFailed transition; nothing to
          // do with the rejection here.
          void this.start().catch(() => undefined);
        }
      },
      (err) => {
        if (!this.#disposed) {
          this.#dispatch({ type: 'runtimeFailed' }, { error: toError(err) });
        }
      },
    );
    this.#unsubscribe = this.client.subscribe((event) => this.#onClientEvent(event));
  }

  getSnapshot = (): WalletSnapshot => this.#store.getSnapshot();
  subscribe = (listener: () => void): (() => void) => this.#store.subscribe(listener);

  // Guards a public mutator against running after dispose(): a disposed
  // engine has already torn down its subscriptions and background processes,
  // so any RPC it kicks off would race a client no consumer can observe
  // through the snapshot.
  #assertNotDisposed(): void {
    if (this.#disposed) {
      throw new Error('the engine has been disposed');
    }
  }

  async start(config?: RuntimeConfig): Promise<WalletInfo> {
    this.#assertNotDisposed();
    const cfg = config ?? this.#config;
    if (!cfg) {
      throw new Error(
        'start() needs a runtime config: pass one, or set config on the engine factory',
      );
    }
    // The machine ignores startRequested while stopping, but without this
    // guard the client RPC below would still fire mid-stop.
    if (this.getSnapshot().phase === 'stopping') {
      throw new Error('cannot start while the runtime is stopping');
    }
    this.#refreshFailures = 0;
    this.#dispatch({ type: 'startRequested' }, { error: null });
    try {
      const info = await this.client.start(cfg);
      this.#dispatch({ type: 'infoReceived', info }, { info });
      try {
        await this.refresh();
      } catch {
        // A locked or empty wallet can fail balance/list until bootstrap.
      }

      return info;
    } catch (err) {
      const error = toError(err);
      this.#dispatch({ type: 'startFailed' }, { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#assertNotDisposed();
    this.#dispatch({ type: 'stopRequested' });
    try {
      await this.client.stop();
      this.#dispatch(
        { type: 'stopCompleted' },
        { info: null, balance: null, activity: [], error: null },
      );
      this.#rejectRestoreOnTeardown();
    } catch (err) {
      const error = toError(err);
      this.#dispatch({ type: 'stopFailed' }, { error });
      throw error;
    }
  }

  async refresh(): Promise<void> {
    this.#assertNotDisposed();
    await this.#fetchAll();
  }

  async createWallet(req: CreateWalletRequest): Promise<CreateWalletResult> {
    this.#assertNotDisposed();
    const result = await this.client.createWallet(req);
    await this.#adoptInfo();
    this.#kickRefresh();

    return result;
  }
  restoreWallet(req: RestoreWalletRequest): Promise<WalletInfo> {
    // A restore with server-assisted recovery blocks createWallet for the
    // whole indexer scan, but the daemon marks the wallet ready before the
    // scan runs. So kick createWallet off without awaiting it, resolve this
    // promise as soon as the wallet is usable (the readiness poll below), and
    // track the scan through snapshot.recovery when the caller opted in.
    if (this.#disposed) {
      return Promise.reject(new Error('the engine has been disposed'));
    }
    if (!req.mnemonic || req.mnemonic.length === 0) {
      return Promise.reject(new Error('a restore needs a mnemonic'));
    }
    if (this.#restore && !this.#restore.settled) {
      // A second concurrent restore would otherwise clobber #restore and
      // strand the first caller's promise; reject the new call up front
      // instead, before dispatching anything, so the first caller's promise
      // stays valid.
      return Promise.reject(new Error('a restore is already in flight'));
    }
    const tracking = Boolean(req.recoverState);
    this.#dispatch(
      { type: 'restoreRequested' },
      {
        error: null,
        recovery: tracking ? { status: 'restoring' } : { status: 'idle' },
      },
    );
    const promise = new Promise<WalletInfo>((resolve, reject) => {
      this.#restore = { resolve, reject, settled: false };
    });

    this.client.createWallet(req).then(
      async (result) => {
        // dispose() already rejected #restore; a resolving createWallet must
        // not dispatch, adopt info, or kick a refresh on a torn-down engine.
        if (this.#disposed) {
          return;
        }
        // The scan (or a plain restore) finished, so the wallet is up.
        if (tracking) {
          this.#store.update({ recovery: { status: 'done', result } });
        }
        const info = await this.#adoptWalletUp();
        this.#settleRestore(info);
        this.#kickRefresh();
      },
      async (err) => {
        // dispose() already rejected #restore; a settling createWallet must
        // not dispatch, adopt info, or kick a refresh on a torn-down engine.
        if (this.#disposed) {
          return;
        }
        const error = toError(err);
        // Recovery runs after the wallet is created and unlocked, so a
        // failure may leave a usable (if under-populated) wallet. Probe
        // getInfo: if the wallet came up, keep the user in it and surface a
        // failed banner; otherwise the create itself failed, so fall back to
        // onboarding and reject.
        let probe: WalletInfo | null = null;
        try {
          probe = await this.client.getInfo();
        } catch {
          // Treat an unreachable daemon as not-came-up.
        }
        const cameUp = Boolean(
          probe && (probe.walletReady || probe.walletState === WalletState.Ready),
        );
        if (cameUp && probe) {
          this.#dispatch(
            { type: 'restoreFailedWalletUp' },
            {
              info: probe,
              recovery: tracking
                ? { status: 'failed', error, walletUsable: true }
                : { status: 'idle' },
            },
          );
          this.#settleRestore(probe);
          this.#kickRefresh();
        } else {
          // The wallet never came up, so the phase falls back to
          // needsWallet, but recovery still records the failure: without
          // this, a screen that unmounts on the rejection (returning to
          // needsWallet) would lose the error the moment its hook-local
          // state disappears with it. The snapshot survives that unmount.
          this.#dispatch(
            { type: 'restoreFailedWalletDown' },
            { recovery: { status: 'failed', error, walletUsable: false } },
          );
          this.#rejectRestore(error);
        }
      },
    ).catch((err) => this.#rejectRestore(toError(err)));

    return promise;
  }
  // A no-op while a scan is live: a stray banner dismiss must not wipe the
  // in-progress restoring state out from under the poll that is tracking it.
  acknowledgeRecovery(): void {
    if (this.getSnapshot().recovery.status === 'restoring') {
      return;
    }
    this.#store.update({ recovery: { status: 'idle' } });
  }
  async unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult> {
    this.#assertNotDisposed();
    const result = await this.client.unlockWallet(req);
    await this.#adoptInfo();
    this.#kickRefresh();

    return result;
  }
  async openWalletFromPasskey(
    req: OpenWalletFromPasskeyRequest,
  ): Promise<OpenWalletFromPasskeyResult> {
    this.#assertNotDisposed();
    const result = await this.client.openWalletFromPasskey(req);
    await this.#adoptInfo();
    this.#kickRefresh();

    return result;
  }
  async deposit(req: DepositRequest = {}): Promise<DepositResult> {
    this.#assertNotDisposed();
    const result = await this.client.deposit(req);
    this.#kickRefresh();

    return result;
  }
  async receive(req: ReceiveRequest): Promise<ReceiveResult> {
    this.#assertNotDisposed();
    const result = await this.client.receive(req);
    this.#kickRefresh();

    return result;
  }
  prepareSend(req: SendRequest): Promise<PrepareSendResult> {
    this.#assertNotDisposed();
    // A quote moves no money, so nothing to refresh.
    return this.client.prepareSend(req);
  }
  async sendPrepared(prepared: PrepareSendResult): Promise<SendResult> {
    this.#assertNotDisposed();
    const result = await this.client.sendPrepared(prepared);
    this.#kickRefresh();

    return result;
  }
  async send(req: SendRequest): Promise<SendResult> {
    this.#assertNotDisposed();
    const result = await this.client.send(req);
    this.#kickRefresh();

    return result;
  }

  clearLogs(): void {
    this.#store.update({ logs: [] });
  }

  dispose(): void {
    this.#disposed = true;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#stream.stop();
    this.#reconciler.cancel();
    this.#syncPoller.stop();
    this.#restorePoller.stop();
    this.#rejectRestore(new Error('the engine was disposed during the restore'));
  }

  // ----- internals -----

  #onClientEvent(event: WavelengthEvent): void {
    if (event.type === 'runtimeReady') {
      this.#dispatch({ type: 'runtimeReady' });
    } else if (event.type === 'runtimeStopped') {
      // A clean stop() or a runtime crash (the worker transport surfaces a
      // fatal as runtimeStopped). Either way the engine below is gone.
      this.#dispatch(
        { type: 'runtimeStopped' },
        { info: null, balance: null, activity: [] },
      );
      this.#rejectRestoreOnTeardown();
    } else if (event.type === 'log') {
      const logs = [...this.getSnapshot().logs, event.payload].slice(-MAX_LOGS);
      this.#store.update({ logs });
    } else if (event.type === 'activity') {
      this.#stream.noteActivity(event.payload);
    } else if (event.type === 'activityStream') {
      this.#stream.noteStreamLost();
    }
  }

  // The patch cannot touch phase: phase is derived solely from transition(),
  // so no dispatch site can bypass the machine by smuggling a phase value in
  // through the patch.
  #dispatch(
    event: WalletEngineEvent,
    patch: Omit<Partial<WalletSnapshot>, 'phase'> = {},
  ): void {
    const prev = this.getSnapshot().phase;
    const next = transition(prev, event);
    this.#store.update({ ...patch, phase: next });
    if (next !== prev) {
      this.#reconcileProcesses(next);
    }
  }

  // The process ownership table: which background process runs in which phase.
  #reconcileProcesses(phase: WalletSnapshot['phase']): void {
    if (phase === 'ready') {
      this.#stream.start();
    } else {
      this.#stream.stop();
      this.#reconciler.cancel();
    }
    if (phase === 'syncing') {
      this.#syncPoller.start();
    } else {
      this.#syncPoller.stop();
    }
    if (phase === 'restoring') {
      this.#restorePoller.start();
    } else {
      this.#restorePoller.stop();
    }
  }

  // Fetches info, balance, and activity concurrently, applies reference
  // stabilization, and dispatches infoReceived so the phase re-derives.
  async #fetchAll(): Promise<Balance | null> {
    const [info, balance, rows] = await Promise.all([
      this.client.getInfo(),
      this.client.balance(),
      this.client.list({ view: 'activity', pendingOnly: false }),
    ]);
    const snap = this.getSnapshot();
    // A refresh in flight when stop() lands resolves after the phase has
    // already moved to stopping or stopped. Dispatching infoReceived here
    // would ignore-transition through the phase machine but still apply the
    // patch, repopulating info/balance/activity that stopCompleted just
    // cleared. Bail out before dispatching so a late read cannot resurrect a
    // snapshot the wallet promised was gone.
    if (snap.phase === 'stopping' || snap.phase === 'stopped') {
      return snap.balance;
    }
    const entries: Entry[] = rows.activity?.entries || [];
    const nextInfo = stabilize(snap.info, info);
    const nextBalance = stabilize(snap.balance, balance);
    const nextActivity = stabilize(snap.activity, entries);
    this.#dispatch(
      { type: 'infoReceived', info },
      { info: nextInfo, balance: nextBalance, activity: nextActivity },
    );

    return nextBalance;
  }

  // Refetches complete info after a wallet came up (create/unlock/passkey),
  // instead of fabricating a partial. A single failed attempt is transient
  // (the daemon can take a beat to settle right after create/unlock), so this
  // retries up to ADOPT_INFO_RETRIES times, ADOPT_INFO_RETRY_MS apart. If
  // every attempt fails the daemon is presumed gone: escalate via
  // walletAdoptionFailed rather than silently leaving the wallet stuck
  // without info.
  async #adoptInfo(): Promise<WalletInfo | null> {
    for (let attempt = 0; attempt < ADOPT_INFO_RETRIES; attempt++) {
      if (this.#disposed) {
        return null;
      }
      try {
        const info = await this.client.getInfo();
        this.#dispatch({ type: 'infoReceived', info }, { info });

        return info;
      } catch {
        if (attempt < ADOPT_INFO_RETRIES - 1) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, ADOPT_INFO_RETRY_MS);
          });
        }
      }
    }
    if (!this.#disposed) {
      this.#dispatch(
        { type: 'walletAdoptionFailed' },
        {
          error: new Error(
            'the wallet was created but the daemon stopped responding',
          ),
        },
      );
    }

    return null;
  }

  // Serialized background refresh with a consecutive-failure budget. Below
  // the limit failures stay engine-internal; at the limit the phase escalates
  // so a dead daemon cannot hide behind a healthy-looking ready wallet.
  async #backgroundRefresh(): Promise<BackgroundRefreshResult> {
    const run = () => this.#fetchAll();
    const next = this.#chain.then(run, run);
    this.#chain = next.then(
      () => undefined,
      () => undefined,
    );
    try {
      const balance = await next;
      this.#refreshFailures = 0;

      return { ok: true, balance };
    } catch {
      this.#refreshFailures += 1;
      // backgroundRefreshExhausted only transitions the machine out of
      // 'ready', so dispatching it from any other phase is an ignored
      // transition that would still apply the error patch. That patch would
      // then mislabel an unrelated failure (for example one surfacing while
      // the runtime is stopping) as the wallet having gone unresponsive, so
      // only dispatch it while the phase is actually 'ready'. The failure
      // counter still increments either way.
      if (
        this.#refreshFailures >= BACKGROUND_REFRESH_FAILURE_LIMIT &&
        this.getSnapshot().phase === 'ready'
      ) {
        this.#dispatch(
          { type: 'backgroundRefreshExhausted' },
          { error: new Error('the wallet stopped responding to background refreshes') },
        );
      }

      return { ok: false, balance: null };
    }
  }

  #kickRefresh(): void {
    void this.#backgroundRefresh();
  }

  // The readiness poll during a background restore: only a genuinely ready
  // wallet advances; the transient locked-looking states InitWallet passes
  // through are ignored (the machine has no infoReceived entry for
  // 'restoring', and this tick never dispatches infoReceived).
  #restoreTick = async (): Promise<void> => {
    let info: WalletInfo;
    try {
      info = await this.client.getInfo();
    } catch {
      // Transient while the wallet comes up; keep polling.
      return;
    }
    if (info.walletReady || info.walletState === WalletState.Ready) {
      this.#dispatch({ type: 'walletBecameReady' }, { info });
      this.#settleRestore(info);
      this.#kickRefresh();
    }
  };

  // Adopts post-restore info when the scan finished: refetch, dispatch
  // walletBecameReady (a no-op transition if the poll already won).
  async #adoptWalletUp(): Promise<WalletInfo | null> {
    let info: WalletInfo | null = null;
    try {
      info = await this.client.getInfo();
    } catch {
      // The background refresh converges the snapshot.
    }
    this.#dispatch(
      { type: 'walletBecameReady' },
      info ? { info } : {},
    );

    return info;
  }

  #settleRestore(info: WalletInfo | null): void {
    if (!this.#restore || this.#restore.settled) {
      return;
    }
    const resolved = info ?? this.getSnapshot().info;
    this.#restore.settled = true;
    if (resolved === null) {
      this.#restore.reject(
        new Error('the restored wallet came up but its info could not be read'),
      );
    } else {
      this.#restore.resolve(resolved);
    }
  }

  #rejectRestore(error: Error): void {
    if (this.#restore && !this.#restore.settled) {
      this.#restore.settled = true;
      this.#restore.reject(error);
    }
  }

  // Mirrors dispose()'s pending-restore rejection: the runtime tearing down
  // mid-restore (a clean stop() or a crash) leaves any in-flight restore
  // promise stranded forever unless it is settled here too.
  #rejectRestoreOnTeardown(): void {
    this.#rejectRestore(new Error('the runtime stopped during the restore'));
  }
}

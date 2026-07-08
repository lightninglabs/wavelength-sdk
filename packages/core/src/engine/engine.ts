import type { WalletDKClient } from '../client.ts';
import type { RuntimeConfig } from '../config.ts';
import { toError } from '../errors.ts';
import type { WalletDKEvent } from '../events.ts';
import type {
  CreateWalletRequest,
  DepositRequest,
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
  PrepareSendResult,
  ReceiveResult,
  SendResult,
  UnlockWalletResult,
} from '../results.ts';
import { WalletState, type WalletInfo } from '../state.ts';
import { ActivityStream } from './activity.ts';
import {
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

/** Options for {@link createWalletEngine}. */
export type WalletEngineOptions = {
  /** The transport client the engine drives. */
  client: WalletDKClient;
  /** Default runtime config used by autoStart and by start() with no argument. */
  config?: RuntimeConfig;
  /** Start the runtime automatically once it is ready. Requires config. */
  autoStart?: boolean;
};

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
  readonly client: WalletDKClient;
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
   * the background, observed through snapshot.recovery. Rejects only when the
   * restore fails before the wallet came up.
   */
  restoreWallet(req: RestoreWalletRequest): Promise<WalletInfo>;
  /** Resets snapshot.recovery to idle (e.g. after dismissing a banner). */
  acknowledgeRecovery(): void;
  /** Unlocks an existing wallet, refetches info, and refreshes in the background. */
  unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult>;
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
  return new WalletDKEngine(options);
}

class WalletDKEngine implements WalletEngine {
  readonly client: WalletDKClient;
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

  constructor(options: WalletEngineOptions) {
    this.client = options.client;
    this.#config = options.config;

    this.#stream = new ActivityStream({
      client: this.client,
      onActivity: () => this.#reconciler.trigger(),
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

  async start(config?: RuntimeConfig): Promise<WalletInfo> {
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
    this.#dispatch({ type: 'stopRequested' });
    try {
      await this.client.stop();
      this.#dispatch(
        { type: 'stopCompleted' },
        { info: null, balance: null, activity: [], error: null },
      );
    } catch (err) {
      const error = toError(err);
      this.#dispatch({ type: 'stopFailed' }, { error });
      throw error;
    }
  }

  async refresh(): Promise<void> {
    await this.#fetchAll();
  }

  // Wallet verbs land in Tasks 9 and 10.
  createWallet(_req: CreateWalletRequest): Promise<CreateWalletResult> {
    return Promise.reject(new Error('not implemented'));
  }
  restoreWallet(_req: RestoreWalletRequest): Promise<WalletInfo> {
    return Promise.reject(new Error('not implemented'));
  }
  // A no-op while a scan is live: a stray banner dismiss must not wipe the
  // in-progress restoring state out from under the poll that is tracking it.
  acknowledgeRecovery(): void {
    if (this.getSnapshot().recovery.status === 'restoring') {
      return;
    }
    this.#store.update({ recovery: { status: 'idle' } });
  }
  unlockWallet(_req: UnlockWalletRequest): Promise<UnlockWalletResult> {
    return Promise.reject(new Error('not implemented'));
  }
  deposit(_req?: DepositRequest): Promise<DepositResult> {
    return Promise.reject(new Error('not implemented'));
  }
  receive(_req: ReceiveRequest): Promise<ReceiveResult> {
    return Promise.reject(new Error('not implemented'));
  }
  prepareSend(_req: SendRequest): Promise<PrepareSendResult> {
    return Promise.reject(new Error('not implemented'));
  }
  sendPrepared(_prepared: PrepareSendResult): Promise<SendResult> {
    return Promise.reject(new Error('not implemented'));
  }
  send(_req: SendRequest): Promise<SendResult> {
    return Promise.reject(new Error('not implemented'));
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
  }

  // ----- internals -----

  #onClientEvent(event: WalletDKEvent): void {
    if (event.type === 'runtimeReady') {
      this.#dispatch({ type: 'runtimeReady' });
    } else if (event.type === 'runtimeStopped') {
      // A clean stop() or a runtime crash (the worker transport surfaces a
      // fatal as runtimeStopped). Either way the engine below is gone.
      this.#dispatch(
        { type: 'runtimeStopped' },
        { info: null, balance: null, activity: [] },
      );
    } else if (event.type === 'log') {
      const logs = [...this.getSnapshot().logs, event.payload].slice(-MAX_LOGS);
      this.#store.update({ logs });
    } else if (event.type === 'activity') {
      this.#stream.noteActivity();
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

  async #restoreTick(): Promise<void> {
    // Filled in by the restore task; keeping the poller wired keeps the
    // process table complete.
  }
}

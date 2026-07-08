import {
  Balance,
  CreateWalletRequest,
  CreateWalletResult,
  DepositRequest,
  DepositResult,
  Entry,
  ListResult,
  ReceiveRequest,
  ReceiveResult,
  RuntimeConfig,
  SendRequest,
  SendResult,
  UnlockWalletRequest,
  UnlockWalletResult,
  WalletDKClient,
  WalletDKLogPayload,
  WalletInfo,
  WalletState,
  errorMessage,
  phaseFromInfo,
  type RuntimePhase,
} from "@lightninglabs/walletdk-core";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Identifies a single wallet operation whose busy and error state the provider
 * tracks independently of the others.
 */
export type WalletOperation =
  | "runtime"
  | "refresh"
  | "createWallet"
  | "unlockWallet"
  | "deposit"
  | "receive"
  | "send";

/** Per-operation status: whether it is in flight and its last error message. */
export type OperationState = {
  /** True while the operation is in flight. */
  busy: boolean;
  /** The last error message for the operation, or "" when there is none. */
  error: string;
};

/**
 * The state of a background wallet recovery started by {@link
 * WalletDKReactState.restoreWallet}, a discriminated union keyed on `status`:
 * `idle` before any tracked restore (and after {@link
 * WalletDKReactState.acknowledgeRecovery}); `restoring` while the daemon's
 * server-assisted scan runs; `done` once it completes (carrying the scan's
 * `result` counters); `failed` if the scan errored (carrying the `error`
 * message; the wallet is still usable, its state just may be incomplete). Read
 * it to drive a "restoring your balance and history" banner: the scan runs while
 * the wallet is already usable, so the UI can land on the main wallet and let
 * balances fill in as they are found.
 */
export type RecoveryState =
  | { status: "idle" }
  | { status: "restoring" }
  | { status: "done"; result: CreateWalletResult }
  | { status: "failed"; error: string };

/** The lifecycle status of a {@link RecoveryState}. */
export type RecoveryStatus = RecoveryState["status"];

/**
 * The full wallet state and action set exposed through the provider context and
 * returned by {@link useWalletDK}.
 */
export type WalletDKReactState = {
  /** The underlying transport client backing every action. */
  client: WalletDKClient;
  /** The current runtime/wallet lifecycle phase. */
  phase: RuntimePhase;
  /** The last runtime-level error message, or "" when there is none. */
  error: string;
  /** The most recent wallet info, or null before the runtime reports it. */
  info: Partial<WalletInfo> | null;
  /** The most recent wallet balance, or null before it is known. */
  balance: Balance | null;
  /** The most recent activity entries, newest-first as returned by the daemon. */
  activity: Entry[];
  /** Busy/error state keyed by operation. */
  operations: Record<WalletOperation, OperationState>;
  /** Starts the runtime with the given config and resolves with wallet info. */
  start(config: RuntimeConfig): Promise<WalletInfo>;
  /** Stops the runtime and clears info, balance, and activity. */
  stop(): Promise<void>;
  /** Re-fetches info, balance, and activity, re-deriving the phase. */
  refresh(): Promise<void>;
  /** Creates a new wallet and refreshes state on success. */
  createWallet(req: CreateWalletRequest): Promise<CreateWalletResult>;
  /**
   * Restores a wallet from a mnemonic without blocking on server-assisted
   * recovery. Fire-and-forget: it starts `createWallet(req)` in the background,
   * advances to the main wallet as soon as the daemon reports it ready (which
   * happens before the recovery scan finishes), and, when `req.recoverState` is
   * set, tracks the scan through {@link recovery} so the UI can show a progress
   * banner. Use this instead of `createWallet` for a restore-from-mnemonic flow.
   */
  restoreWallet(req: CreateWalletRequest): void;
  /** The background recovery status set by {@link restoreWallet}. */
  recovery: RecoveryState;
  /** Resets {@link recovery} to `idle` (e.g. after dismissing the banner). */
  acknowledgeRecovery(): void;
  /** Unlocks an existing wallet and refreshes state on success. */
  unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult>;
  /** Requests an on-chain deposit address and refreshes state on success. */
  deposit(req?: DepositRequest): Promise<DepositResult>;
  /** Requests a Lightning receive and refreshes state on success. */
  receive(req: ReceiveRequest): Promise<ReceiveResult>;
  /** Sends a payment and refreshes state on success. */
  send(req: SendRequest): Promise<SendResult>;
  /** A bounded tail of 'log' events from the runtime, newest last. */
  logs: WalletDKLogPayload[];
  /** Clears the buffered log tail. */
  clearLogs(): void;
  /** Clears the error for a single operation. */
  clearOperationError(operation: WalletOperation): void;
};

const WalletDKContext = createContext<WalletDKReactState | null>(null);

// MAX_LOGS bounds the in-memory log tail the provider keeps.
const MAX_LOGS = 200;

// Consecutive failed activity-stream reopens before the stream is treated as
// permanently lost and surfaced as an error, mirroring the syncing poll's
// give-up threshold.
const ACTIVITY_STREAM_FAILURE_LIMIT = 5;

// Follow-up refresh delays (ms) used to reconcile a possibly-stale balance
// after an activity event. The daemon can report an entry settled a beat before
// balance() reflects the new funds, so a single refresh may read a stale value;
// these bounded re-reads catch up to it.
const SETTLE_RECONCILE_DELAYS_MS = [750, 1500, 3000];

// Consecutive failed background refreshes before the wallet is treated as
// unreachable and surfaced as an error, mirroring the activity stream's and the
// syncing poll's give-up thresholds. Without this a daemon that stops answering
// leaves the UI on a healthy 'ready' phase over a frozen balance.
const BACKGROUND_REFRESH_FAILURE_LIMIT = 5;

const defaultOperations: Record<WalletOperation, OperationState> = {
  runtime: { busy: false, error: "" },
  refresh: { busy: false, error: "" },
  createWallet: { busy: false, error: "" },
  unlockWallet: { busy: false, error: "" },
  deposit: { busy: false, error: "" },
  receive: { busy: false, error: "" },
  send: { busy: false, error: "" },
};

/**
 * Provides the wallet runtime state and action set to descendants, wiring a
 * transport client into React state. Wrap the app in this provider and read the
 * state with {@link useWalletDK} or one of the granular hooks.
 */
export function WalletDKProvider({
  children,
  client: clientProp,
  createClient,
}: {
  /** The subtree that gains access to the wallet context. */
  children: ReactNode;
  /**
   * A WalletDKClient from any transport (e.g. createWebClient() from
   * \@lightninglabs/walletdk-web). Provide this, or createClient.
   */
  client?: WalletDKClient;
  /**
   * A factory the provider calls once and memoizes, as an alternative to a
   * prebuilt client. Safe to pass inline; the client is created only once.
   */
  createClient?: () => WalletDKClient;
}) {
  const created = useRef<WalletDKClient | null>(null);
  const client = useMemo<WalletDKClient>(() => {
    if (clientProp) {
      return clientProp;
    }
    if (createClient) {
      created.current ??= createClient();

      return created.current;
    }

    throw new Error(
      "WalletDKProvider requires a `client` or `createClient` prop. Create one " +
        "with createWebClient() from @lightninglabs/walletdk-web.",
    );
  }, [clientProp, createClient]);
  const [phase, setPhase] = useState<RuntimePhase>("loading");
  const [error, setError] = useState("");
  const [info, setInfo] = useState<Partial<WalletInfo> | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  // The last balance fetched, mirrored out of React state so the settle
  // reconcile can compare against the value that predated an activity event.
  const lastBalanceRef = useRef<Balance | null>(null);
  const [activity, setActivity] = useState<Entry[]>([]);
  const [operations, setOperations] = useState(defaultOperations);
  const [logs, setLogs] = useState<WalletDKLogPayload[]>([]);
  const [recovery, setRecovery] = useState<RecoveryState>({ status: "idle" });
  // True while a background restore waits for the freshly created wallet to
  // report ready. It gates the generic syncing poll (below) off, because
  // InitWallet transiently reports an unlocking state that maps to 'locked',
  // which the generic poll would surface as the Unlock screen mid-restore.
  const [awaitingWalletReady, setAwaitingWalletReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    client.ready().then(() => {
      if (!cancelled) {
        setPhase("runtimeReady");
      }
    }).catch((err) => {
      if (!cancelled) {
        const message = errorMessage(err);
        setError(message);
        setPhase("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    return client.subscribe((event) => {
      if (event.type === "runtimeReady") {
        setPhase((current) => {
          return current === "loading" ? "runtimeReady" : current;
        });
      } else if (event.type === "runtimeStopped") {
        // A clean stop() or a runtime crash (the worker transport surfaces a
        // fatal as runtimeStopped). Either way the engine is gone, so drop to
        // 'stopped' instead of leaving the UI on a live phase like 'ready'.
        setInfo(null);
        setBalance(null);
        lastBalanceRef.current = null;
        setActivity([]);
        setPhase("stopped");
      } else if (event.type === "log") {
        setLogs((current) => [...current, event.payload].slice(-MAX_LOGS));
      }
    });
  }, [client]);

  const setOperation = useCallback((
    operation: WalletOperation,
    patch: Partial<OperationState>,
  ) => {
    setOperations((current) => ({
      ...current,
      [operation]: {
        ...current[operation],
        ...patch,
      },
    }));
  }, []);

  const runOperation = useCallback(async <T,>(
    operation: WalletOperation,
    fn: () => Promise<T>,
  ): Promise<T> => {
    setOperation(operation, { busy: true, error: "" });

    try {
      return await fn();
    } catch (err) {
      const message = errorMessage(err);
      setOperation(operation, { error: message });
      throw err;
    } finally {
      setOperation(operation, { busy: false });
    }
  }, [setOperation]);

  // Re-fetches info, balance, and activity and returns the balance it read, so
  // internal callers (the settle reconcile below) can tell when it has stopped
  // changing. The public `refresh` wraps this and resolves with void.
  //
  // `silent` skips the refresh operation's busy/error tracking so a background,
  // stream-driven re-read (the debounced refresh and the settle reconcile) does
  // not flash the user-facing refresh indicator; only a user-initiated refresh
  // toggles operations.refresh.
  const doRefresh = useCallback(async (
    opts?: { silent?: boolean },
  ): Promise<Balance | null> => {
    const fetchAll = async (): Promise<Balance | null> => {
      const nextInfo = await client.getInfo();
      setInfo(nextInfo);
      setPhase(phaseFromInfo(nextInfo));

      const nextBalance = await client.balance();
      setBalance(nextBalance);
      // Mirror the balance into a ref so the settle reconcile can read the
      // pre-event value without waiting for a re-render.
      lastBalanceRef.current = nextBalance;

      const rows = await client.list({
        view: "activity",
        pendingOnly: false,
      });
      setActivity(activityEntries(rows));

      return nextBalance;
    };

    if (opts?.silent) {
      // Silent means no busy indicator, not no error. A background re-read must
      // not spin the user's refresh control, but a failing one still has to
      // surface: otherwise the daemon can stop answering while the UI keeps
      // rendering a healthy 'ready' wallet over a frozen balance.
      try {
        const nextBalance = await fetchAll();
        setOperation("refresh", { error: "" });

        return nextBalance;
      } catch (err) {
        setOperation("refresh", { error: errorMessage(err) });
        throw err;
      }
    }

    return runOperation("refresh", fetchAll);
  }, [client, runOperation, setOperation]);

  const refresh = useCallback(async () => {
    await doRefresh();
  }, [doRefresh]);

  const refreshRef = useRef(doRefresh);
  refreshRef.current = doRefresh;

  // Activity subscription pushes wallet updates from the daemon; refresh
  // balance and history when an entry changes instead of polling. If the
  // stream is lost while ready, resubscribe with a capped backoff so a
  // transient daemon or network blip does not silently freeze the wallet.
  // After too many consecutive failed reopens the stream is treated as
  // permanently lost and surfaced as an error rather than retried forever.
  useEffect(() => {
    if (phase !== "ready") {
      return;
    }

    let cancelled = false;
    let backoff = 1000;
    let failures = 0;
    let refreshFailures = 0;
    // Monotonic id for the current reconcile cycle. Every activity event bumps
    // it, retiring any cycle still in flight.
    let generation = 0;
    let chain: Promise<unknown> = Promise.resolve();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      client.startActivity({ includeExisting: true }).then(
        () => {
          // A clean reopen replays existing entries (includeExisting), which
          // drives the debounced refresh below, so missed changes are caught.
          backoff = 1000;
          failures = 0;
        },
        () => onReopenFailure(),
      );
    };

    const onReopenFailure = () => {
      if (cancelled) {
        return;
      }
      failures += 1;
      if (failures >= ACTIVITY_STREAM_FAILURE_LIMIT) {
        // The stream could not be re-established after repeated attempts;
        // surface it instead of leaving the wallet looking healthy while its
        // balance and history silently stop updating.
        setError("lost the activity stream and could not reconnect");
        setPhase("error");

        return;
      }
      scheduleRetry();
    };

    const scheduleRetry = () => {
      if (cancelled) {
        return;
      }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30000);
        open();
      }, backoff);
    };

    open();

    // Background refreshes are serialized: two concurrent reads would race on
    // setBalance/setInfo/setActivity, and the slower one would win with the
    // staler snapshot.
    const backgroundRefresh = (): Promise<Balance | null> => {
      const run = () => refreshRef.current({ silent: true });
      const next = chain.then(run, run);
      chain = next.then(
        () => undefined,
        () => undefined,
      );

      return next;
    };

    const noteRefreshOk = () => {
      refreshFailures = 0;
    };

    const noteRefreshFailed = () => {
      refreshFailures += 1;
      if (refreshFailures >= BACKGROUND_REFRESH_FAILURE_LIMIT) {
        setError("the wallet stopped responding to background refreshes");
        setPhase("error");
      }
    };

    // Balance can lag the activity event that announced a settled entry: the
    // daemon may report the entry complete a beat before balance() reflects the
    // new VTXO. A single refresh would then capture a stale balance and, with no
    // polling while ready, leave it stale until a manual refresh.
    //
    // `baseline` is the balance from before the event. Equality between two
    // consecutive reads cannot distinguish a settled balance from one that is
    // still lagging, so stop only once the balance has moved off `baseline` and
    // then held steady. When it never moves, probe the whole bounded schedule
    // rather than give up on the first repeat.
    const reconcile = (
      attempt: number,
      gen: number,
      baseline: Balance | null,
      prev: Balance | null,
    ) => {
      if (attempt >= SETTLE_RECONCILE_DELAYS_MS.length) {
        return;
      }
      reconcileTimer = setTimeout(() => {
        reconcileTimer = undefined;
        if (cancelled || gen !== generation) {
          return;
        }
        backgroundRefresh().then(
          (next) => {
            if (cancelled || gen !== generation) {
              return;
            }
            noteRefreshOk();
            const moved = !balancesEqual(baseline, next);
            const steady = balancesEqual(prev, next);
            if (moved && steady) {
              return;
            }
            reconcile(attempt + 1, gen, baseline, next);
          },
          () => {
            if (!cancelled && gen === generation) {
              noteRefreshFailed();
            }
          },
        );
      }, SETTLE_RECONCILE_DELAYS_MS[attempt]);
    };

    const refreshCycle = (gen: number) => {
      // Stream-driven, so refresh silently: an incoming activity event should
      // not spin the user's manual refresh control.
      const baseline = lastBalanceRef.current;
      backgroundRefresh().then(
        (first) => {
          if (cancelled || gen !== generation) {
            return;
          }
          noteRefreshOk();
          reconcile(0, gen, baseline, first);
        },
        () => {
          if (!cancelled && gen === generation) {
            noteRefreshFailed();
          }
        },
      );
    };

    const unsubscribe = client.subscribe((event) => {
      if (event.type === "activity") {
        // A fresh change supersedes any in-flight reconcile. Bumping the
        // generation retires the previous cycle wherever it is: clearTimeout
        // alone would only cancel a scheduled probe, not a refresh already in
        // flight, which would otherwise resume a stale chain on resolve.
        generation += 1;
        const gen = generation;
        clearTimeout(debounce);
        clearTimeout(reconcileTimer);
        debounce = setTimeout(() => refreshCycle(gen), 250);

        return;
      }
      if (event.type === "activityStream") {
        // The stream was lost while ready; reopen after a backoff.
        scheduleRetry();
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(retryTimer);
      clearTimeout(reconcileTimer);
      unsubscribe();
      client.stopActivity();
    };
  }, [client, phase]);

  // While syncing, poll until the wallet reports ready: the phase is only
  // re-derived on refresh, so without this the wallet would never leave
  // 'syncing'. The SDK owns this so hosts don't each re-implement the poll.
  useEffect(() => {
    // A background restore owns readiness itself (see below); defer to it so the
    // generic poll does not fight it over the transient pre-ready states.
    if (phase !== "syncing" || awaitingWalletReady) {
      return;
    }

    // A transient refresh failure while syncing is expected, but a sustained run
    // of them would otherwise leave the wallet stuck on 'syncing' forever, so
    // after several consecutive failures surface the error and stop polling.
    let failures = 0;
    const id = setInterval(() => {
      refreshRef.current().then(
        () => {
          failures = 0;
        },
        (err) => {
          failures += 1;
          if (failures >= 5) {
            clearInterval(id);
            setError(errorMessage(err));
            setPhase("error");
          }
        },
      );
    }, 2000);

    return () => clearInterval(id);
  }, [phase, awaitingWalletReady]);

  // While a background restore is bringing a freshly created wallet up, poll
  // getInfo until it reports ready, then advance to the main wallet. This is
  // separate from the generic syncing poll above because InitWallet passes
  // through a transient unlocking state (mapped to 'locked') before ready, which
  // the generic poll would surface as the Unlock screen. Here we only react to
  // the ready state, ignoring the intermediate ones.
  useEffect(() => {
    if (!awaitingWalletReady) {
      return;
    }

    let stopped = false;
    const tick = async () => {
      let nextInfo;
      try {
        nextInfo = await client.getInfo();
      } catch {
        // Transient while the wallet comes up; keep polling.
        return;
      }
      if (stopped) {
        return;
      }
      if (nextInfo.walletReady || nextInfo.walletState === WalletState.Ready) {
        setInfo(nextInfo);
        setPhase("ready");
        setAwaitingWalletReady(false);
        // Fetch balance and history now that the wallet is ready, rather than
        // leaving them null until the recovery scan finishes: a null balance
        // reads as "still loading" to hosts, so without this the main wallet
        // would sit on a loader for the whole scan. Recovery then keeps them
        // fresh through the activity stream as it finds more.
        void refreshRef.current().catch(() => undefined);
      }
    };

    const id = setInterval(() => void tick(), 1500);
    void tick();

    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [awaitingWalletReady, client]);

  const start = useCallback(async (config: RuntimeConfig) => {
    setPhase("starting");
    setError("");

    return runOperation("runtime", async () => {
      const nextInfo = await client.start(config);
      setInfo(nextInfo);
      setPhase(phaseFromInfo(nextInfo));

      try {
        await refresh();
      } catch {
        // A locked or empty wallet can fail balance/list until bootstrap.
      }

      return nextInfo;
    });
  }, [client, refresh, runOperation]);

  const stop = useCallback(async () => {
    setPhase("stopping");

    return runOperation("runtime", async () => {
      await client.stop();
      setInfo(null);
      setBalance(null);
      lastBalanceRef.current = null;
      setActivity([]);
      setPhase("stopped");
    });
  }, [client, runOperation]);

  const createWallet = useCallback(async (req: CreateWalletRequest) => {
    return runOperation("createWallet", async () => {
      const result = await client.createWallet(req);
      setInfo((current) => ({
        ...(current || {}),
        identityPubKey: result.identityPubKey,
        walletState: WalletState.Ready,
        walletReady: true,
      }));
      setPhase("ready");
      await refresh();

      return result;
    });
  }, [client, refresh, runOperation]);

  const acknowledgeRecovery = useCallback(() => {
    setRecovery({ status: "idle" });
  }, []);

  const restoreWallet = useCallback((req: CreateWalletRequest) => {
    // A restore with server-assisted recovery blocks the createWallet call for
    // the whole indexer scan, but the daemon marks the wallet ready before the
    // scan runs. So kick createWallet off without awaiting it, drive to the main
    // wallet as soon as it reports ready (via the readiness poll above), and
    // track the scan through `recovery` when the caller opted into it.
    const tracking = Boolean(req.recoverState);

    setOperation("createWallet", { busy: true, error: "" });
    setRecovery(tracking ? { status: "restoring" } : { status: "idle" });
    setPhase("syncing");
    setAwaitingWalletReady(true);

    client.createWallet(req).then(
      (result) => {
        setOperation("createWallet", { busy: false });
        setInfo((current) => ({
          ...(current || {}),
          identityPubKey: result.identityPubKey,
          walletState: WalletState.Ready,
          walletReady: true,
        }));
        setAwaitingWalletReady(false);
        setPhase((current) => (current === "syncing" ? "ready" : current));
        if (tracking) {
          setRecovery({ status: "done", result });
        }
        // Pull the recovered balance and history in now that the scan is done.
        void refreshRef.current().catch(() => undefined);
      },
      async (err) => {
        const message = errorMessage(err);
        setOperation("createWallet", { busy: false, error: message });
        setAwaitingWalletReady(false);

        // Recovery runs after the wallet is created and unlocked, so a failure
        // may leave a usable (if under-populated) wallet. Probe getInfo: if the
        // wallet came up, keep the user in it and surface a failed banner;
        // otherwise the create itself failed, so fall back to onboarding with
        // the error and clear the recovery state.
        let cameUp = false;
        try {
          const probe = await client.getInfo();
          cameUp = Boolean(
            probe.walletReady || probe.walletState === WalletState.Ready,
          );
          if (cameUp) {
            setInfo(probe);
          }
        } catch {
          // Treat an unreachable daemon as not-came-up.
        }

        if (cameUp) {
          setPhase("ready");
          // Only show the recovery-failed banner when the caller opted into
          // recovery; a plain restore that failed post-ready never ran a scan,
          // so its error surfaces through operations.createWallet.error instead.
          setRecovery(
            tracking
              ? { status: "failed", error: message }
              : { status: "idle" },
          );
        } else {
          setPhase((current) =>
            current === "syncing" ? "needsWallet" : current,
          );
          setRecovery({ status: "idle" });
        }
      },
    );
  }, [client, setOperation]);

  const unlockWallet = useCallback(async (req: UnlockWalletRequest) => {
    return runOperation("unlockWallet", async () => {
      const result = await client.unlockWallet(req);
      setInfo((current) => ({
        ...(current || {}),
        identityPubKey: result.identityPubKey,
        walletState: WalletState.Ready,
        walletReady: true,
      }));
      setPhase("ready");
      await refresh();

      return result;
    });
  }, [client, refresh, runOperation]);

  const deposit = useCallback(async (req: DepositRequest = {}) => {
    return runOperation("deposit", async () => {
      const result = await client.deposit(req);
      await refresh();

      return result;
    });
  }, [client, refresh, runOperation]);

  const receive = useCallback(async (req: ReceiveRequest) => {
    return runOperation("receive", async () => {
      const result = await client.receive(req);
      await refresh();

      return result;
    });
  }, [client, refresh, runOperation]);

  const send = useCallback(async (req: SendRequest) => {
    return runOperation("send", async () => {
      const result = await client.send(req);
      await refresh();

      return result;
    });
  }, [client, refresh, runOperation]);

  const clearOperationError = useCallback((operation: WalletOperation) => {
    setOperation(operation, { error: "" });
  }, [setOperation]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const value = useMemo<WalletDKReactState>(() => ({
    acknowledgeRecovery,
    activity,
    balance,
    clearLogs,
    clearOperationError,
    client,
    createWallet,
    deposit,
    error,
    info,
    logs,
    operations,
    phase,
    receive,
    recovery,
    refresh,
    restoreWallet,
    send,
    start,
    stop,
    unlockWallet,
  }), [
    acknowledgeRecovery,
    activity,
    balance,
    clearLogs,
    clearOperationError,
    client,
    createWallet,
    deposit,
    error,
    info,
    logs,
    operations,
    phase,
    receive,
    recovery,
    refresh,
    restoreWallet,
    send,
    start,
    stop,
    unlockWallet,
  ]);

  return (
    <WalletDKContext.Provider value={value}>
      {children}
    </WalletDKContext.Provider>
  );
}

/**
 * Returns the full wallet state and action set from the nearest
 * {@link WalletDKProvider}. Throws if called outside a provider.
 */
export function useWalletDK(): WalletDKReactState {
  const value = useContext(WalletDKContext);
  if (!value) {
    throw new Error("useWalletDK must be used inside WalletDKProvider");
  }

  return value;
}

function activityEntries(result: ListResult): Entry[] {
  return result.activity?.entries || [];
}

// Whether two balance snapshots carry the same figures. The settle reconcile
// uses it to decide when a post-activity re-read has caught up: once the balance
// stops changing across reads there is nothing left to reconcile.
function balancesEqual(a: Balance | null, b: Balance | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key as keyof Balance] !== b[key as keyof Balance]) {
      return false;
    }
  }

  return true;
}

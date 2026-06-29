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
  const [activity, setActivity] = useState<Entry[]>([]);
  const [operations, setOperations] = useState(defaultOperations);
  const [logs, setLogs] = useState<WalletDKLogPayload[]>([]);

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

  const refresh = useCallback(async () => {
    return runOperation("refresh", async () => {
      const nextInfo = await client.getInfo();
      setInfo(nextInfo);
      setPhase(phaseFromInfo(nextInfo));

      const nextBalance = await client.balance();
      setBalance(nextBalance);

      const rows = await client.list({
        view: "activity",
        pendingOnly: false,
      });
      setActivity(activityEntries(rows));
    });
  }, [client, runOperation]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Activity subscription pushes wallet updates from the daemon; refresh
  // balance and history when an entry changes instead of polling.
  useEffect(() => {
    if (phase !== "ready") {
      return;
    }

    client.startActivity({ includeExisting: true }).catch(() => undefined);

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = client.subscribe((event) => {
      if (event.type !== "activity") {
        return;
      }

      clearTimeout(debounce);
      debounce = setTimeout(() => {
        refreshRef.current().catch(() => undefined);
      }, 250);
    });

    return () => {
      clearTimeout(debounce);
      unsubscribe();
      client.stopActivity();
    };
  }, [client, phase]);

  // While syncing, poll until the wallet reports ready: the phase is only
  // re-derived on refresh, so without this the wallet would never leave
  // 'syncing'. The SDK owns this so hosts don't each re-implement the poll.
  useEffect(() => {
    if (phase !== "syncing") {
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
  }, [phase]);

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
    refresh,
    send,
    start,
    stop,
    unlockWallet,
  }), [
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
    refresh,
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

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  if (typeof err === "string") {
    return err;
  }

  try {
    return JSON.stringify(err);
  } catch {
    // JSON.stringify throws on circular structures or BigInt; fall back to a
    // plain string so the error path never throws a new error.
    return String(err);
  }
}

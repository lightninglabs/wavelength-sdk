import type {
  Balance,
  CreateWalletRequest,
  CreateWalletResult,
  DepositRequest,
  DepositResult,
  Entry,
  ExitBatchEvent,
  ExitBatchOptions,
  ExitBatchResult,
  ExitRequest,
  ExitResult,
  ExitStatusResult,
  ExitSummaryResult,
  GetExitPlanRequest,
  GetExitPlanResult,
  ListRequest,
  ListResult,
  PrepareSendResult,
  ReceiveRequest,
  ReceiveResult,
  RecoveryState,
  RestoreWalletRequest,
  RuntimeConfig,
  RuntimePhase,
  SendRequest,
  SendResult,
  SweepWalletRequest,
  SweepWalletResult,
  UnlockWalletRequest,
  UnlockWalletResult,
  WavelengthLogPayload,
  WalletInfo,
} from "@lightninglabs/wavelength-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWalletEngine } from "./provider.tsx";
import { useWalletMutationState } from "./useWalletMutation.ts";
import { useWalletSelector } from "./useWalletSelector.ts";

/**
 * The application-shell hook: the lifecycle phase to route on, the last fatal
 * runtime error, and the runtime actions. There are no pending flags here:
 * phase === 'starting' / 'stopping' already encode them.
 */
export function useWallet(): {
  phase: RuntimePhase;
  error: Error | null;
  start: (config?: RuntimeConfig) => Promise<WalletInfo>;
  stop: () => Promise<void>;
} {
  const engine = useWalletEngine();
  const phase = useWalletSelector((s) => s.phase);
  const error = useWalletSelector((s) => s.error);
  const start = useCallback(
    (config?: RuntimeConfig) => engine.start(config),
    [engine],
  );
  const stop = useCallback(() => engine.stop(), [engine]);

  return { phase, error, start, stop };
}

/** The most recent complete wallet info, or null before the runtime reports it. */
export function useWalletInfo(): WalletInfo | null {
  return useWalletSelector((s) => s.info);
}

/** The most recent wallet balance, or null before it is known. */
export function useWalletBalance(): Balance | null {
  return useWalletSelector((s) => s.balance);
}

/** The most recent activity entries, newest-first as returned by the daemon. */
export function useWalletActivity(): readonly Entry[] {
  return useWalletSelector((s) => s.activity);
}

/** The background recovery status and its acknowledge action. */
export function useWalletRecovery(): {
  recovery: RecoveryState;
  acknowledge: () => void;
} {
  const engine = useWalletEngine();
  const recovery = useWalletSelector((s) => s.recovery);
  const acknowledge = useCallback(() => engine.acknowledgeRecovery(), [engine]);

  return { recovery, acknowledge };
}

/** The buffered runtime log tail and a clear action. */
export function useWalletLogs(): {
  logs: readonly WavelengthLogPayload[];
  clear: () => void;
} {
  const engine = useWalletEngine();
  const logs = useWalletSelector((s) => s.logs);
  const clear = useCallback(() => engine.clearLogs(), [engine]);

  return { logs, clear };
}

/** The result of {@link useWalletCreate}. */
export type UseWalletCreateResult = {
  /** Creates a new wallet. */
  create: (req: CreateWalletRequest) => Promise<CreateWalletResult>;
  /** True while a create is in flight. */
  createPending: boolean;
  /** The last create failure, or null. */
  createError: Error | null;
  /** The last successful create result, or null. */
  createData: CreateWalletResult | null;
  /** Clears the create error and data. */
  resetCreate: () => void;
};

/**
 * Creates a new wallet, exposing `createPending` / `createError` /
 * `createData`. This hook and {@link useWalletPasskey} both expose a
 * `create` verb, and destructuring both collides on all four of `create`,
 * `createPending`, `createError`, and `resetCreate`; components composing
 * both should keep one as a namespaced object (e.g.
 * `const passkey = useWalletPasskey(...)`) instead of destructuring both.
 */
export function useWalletCreate(): UseWalletCreateResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<CreateWalletResult>();
  const create = useCallback(
    (req: CreateWalletRequest) => m.track(() => engine.createWallet(req)),
    [engine, m.track],
  );

  return {
    create,
    createPending: m.pending,
    createError: m.error,
    createData: m.data,
    resetCreate: m.reset,
  };
}

/** The result of {@link useWalletRestore}. */
export type UseWalletRestoreResult = {
  /** Restores a wallet from a mnemonic. */
  restore: (req: RestoreWalletRequest) => Promise<WalletInfo>;
  /** True while a restore is in flight. */
  restorePending: boolean;
  /** The last restore failure, or null. */
  restoreError: Error | null;
  /** The last successful restore result, or null. */
  restoreData: WalletInfo | null;
  /** Clears the restore error and data. */
  resetRestore: () => void;
};

/**
 * Restores a wallet from a mnemonic, exposing `restorePending` /
 * `restoreError` / `restoreData`. The promise (and `restorePending`)
 * resolve when the wallet is usable, not when the optional recovery scan
 * finishes; observe the scan through useWalletRecovery.
 */
export function useWalletRestore(): UseWalletRestoreResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<WalletInfo>();
  const restore = useCallback(
    (req: RestoreWalletRequest) => m.track(() => engine.restoreWallet(req)),
    [engine, m.track],
  );

  return {
    restore,
    restorePending: m.pending,
    restoreError: m.error,
    restoreData: m.data,
    resetRestore: m.reset,
  };
}

/** The result of {@link useWalletUnlock}. */
export type UseWalletUnlockResult = {
  /** Unlocks an existing wallet. */
  unlock: (req: UnlockWalletRequest) => Promise<UnlockWalletResult>;
  /** True while an unlock is in flight. */
  unlockPending: boolean;
  /** The last unlock failure, or null. */
  unlockError: Error | null;
  /** The last successful unlock result, or null. */
  unlockData: UnlockWalletResult | null;
  /** Clears the unlock error and data. */
  resetUnlock: () => void;
};

/** Unlocks an existing wallet, exposing `unlockPending` / `unlockError` / `unlockData`. */
export function useWalletUnlock(): UseWalletUnlockResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<UnlockWalletResult>();
  const unlock = useCallback(
    (req: UnlockWalletRequest) => m.track(() => engine.unlockWallet(req)),
    [engine, m.track],
  );

  return {
    unlock,
    unlockPending: m.pending,
    unlockError: m.error,
    unlockData: m.data,
    resetUnlock: m.reset,
  };
}

/** The result of {@link useWalletDeposit}. */
export type UseWalletDepositResult = {
  /** Requests an on-chain deposit address. */
  deposit: (req?: DepositRequest) => Promise<DepositResult>;
  /** True while a deposit request is in flight. */
  depositPending: boolean;
  /** The last deposit failure, or null. */
  depositError: Error | null;
  /** The last successful deposit result, or null. */
  depositData: DepositResult | null;
  /** Clears the deposit error and data. */
  resetDeposit: () => void;
};

/** Requests an on-chain deposit address, exposing `depositPending` / `depositError` / `depositData`. */
export function useWalletDeposit(): UseWalletDepositResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<DepositResult>();
  const deposit = useCallback(
    (req?: DepositRequest) => m.track(() => engine.deposit(req)),
    [engine, m.track],
  );

  return {
    deposit,
    depositPending: m.pending,
    depositError: m.error,
    depositData: m.data,
    resetDeposit: m.reset,
  };
}

/** The result of {@link useWalletReceive}. */
export type UseWalletReceiveResult = {
  /** Requests a Lightning receive. */
  receive: (req: ReceiveRequest) => Promise<ReceiveResult>;
  /** True while a receive is in flight. */
  receivePending: boolean;
  /** The last receive failure, or null. */
  receiveError: Error | null;
  /** The last successful receive result, or null. */
  receiveData: ReceiveResult | null;
  /** Clears the receive error and data. */
  resetReceive: () => void;
};

/** Requests a Lightning receive, exposing `receivePending` / `receiveError` / `receiveData`. */
export function useWalletReceive(): UseWalletReceiveResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<ReceiveResult>();
  const receive = useCallback(
    (req: ReceiveRequest) => m.track(() => engine.receive(req)),
    [engine, m.track],
  );

  return {
    receive,
    receivePending: m.pending,
    receiveError: m.error,
    receiveData: m.data,
    resetReceive: m.reset,
  };
}

/** The result of {@link useWalletPrepareSend}. */
export type UseWalletPrepareSendResult = {
  /** Quotes a payment without dispatching it. */
  prepare: (req: SendRequest) => Promise<PrepareSendResult>;
  /** True while a prepare is in flight. */
  preparePending: boolean;
  /** The last prepare failure, or null. */
  prepareError: Error | null;
  /** The last successful prepare result, or null. */
  prepareData: PrepareSendResult | null;
  /** Clears the prepare error and data. */
  resetPrepare: () => void;
};

/**
 * Quotes a payment without dispatching it. `prepareData` holds the latest
 * quote for a review screen; pair with useWalletSend's `sendPrepared` to
 * dispatch.
 */
export function useWalletPrepareSend(): UseWalletPrepareSendResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<PrepareSendResult>();
  const prepare = useCallback(
    (req: SendRequest) => m.track(() => engine.prepareSend(req)),
    [engine, m.track],
  );

  return {
    prepare,
    preparePending: m.pending,
    prepareError: m.error,
    prepareData: m.data,
    resetPrepare: m.reset,
  };
}

/** The result of {@link useWalletSend}. */
export type UseWalletSendResult = {
  /** Dispatches a payment in one shot. */
  send: (req: SendRequest) => Promise<SendResult>;
  /** Dispatches a payment from a quote returned by useWalletPrepareSend. */
  sendPrepared: (prepared: PrepareSendResult) => Promise<SendResult>;
  /** True while a send is in flight. */
  sendPending: boolean;
  /** The last send failure, or null. */
  sendError: Error | null;
  /** The last successful send result, or null. */
  sendData: SendResult | null;
  /** Clears the send error and data. */
  resetSend: () => void;
};

/**
 * Dispatches a payment: `send` is the one-shot path, `sendPrepared` confirms
 * a quote from useWalletPrepareSend. The two verbs are alternative dispatch
 * paths for the same payment and share one `sendPending` / `sendError` /
 * `sendData` slot.
 */
export function useWalletSend(): UseWalletSendResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<SendResult>();
  const send = useCallback(
    (req: SendRequest) => m.track(() => engine.send(req)),
    [engine, m.track],
  );
  const sendPrepared = useCallback(
    (prepared: PrepareSendResult) => m.track(() => engine.sendPrepared(prepared)),
    [engine, m.track],
  );

  return {
    send,
    sendPrepared,
    sendPending: m.pending,
    sendError: m.error,
    sendData: m.data,
    resetSend: m.reset,
  };
}

/** The result of {@link useWalletRefresh}. */
export type UseWalletRefreshResult = {
  /** Re-fetches info, balance, and activity. */
  refresh: () => Promise<void>;
  /** True while a refresh triggered by this hook instance is in flight. */
  refreshPending: boolean;
  /** The last refresh failure, or null. */
  refreshError: Error | null;
  /** Clears the refresh error. */
  resetRefresh: () => void;
};

/**
 * Re-fetches info, balance, and activity. `refreshPending` tracks this hook
 * instance's own calls only (what a pull-to-refresh spinner should show);
 * engine-initiated background refreshes never flip it.
 */
export function useWalletRefresh(): UseWalletRefreshResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<void>();
  const refresh = useCallback(
    () => m.track(() => engine.refresh()),
    [engine, m.track],
  );

  return {
    refresh,
    refreshPending: m.pending,
    refreshError: m.error,
    resetRefresh: m.reset,
  };
}

/** The result of {@link useWalletExit}. */
export type UseWalletExitResult = {
  /** Starts a single exit (cooperative or unilateral). */
  exit: (req: ExitRequest) => Promise<ExitResult>;
  exitPending: boolean;
  exitError: Error | null;
  exitData: ExitResult | null;
  resetExit: () => void;
};

/** Starts a single exit for one outpoint. Takes the full request union. */
export function useWalletExit(): UseWalletExitResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<ExitResult>();
  const exit = useCallback(
    (req: ExitRequest) => m.track(() => engine.exit(req)),
    [engine, m.track],
  );

  return {
    exit,
    exitPending: m.pending,
    exitError: m.error,
    exitData: m.data,
    resetExit: m.reset,
  };
}

/** The result of {@link useWalletExitPlan}. */
export type UseWalletExitPlanResult = {
  /** Previews unilateral-exit readiness and funding for a set of outpoints. */
  plan: (req: GetExitPlanRequest) => Promise<GetExitPlanResult>;
  planPending: boolean;
  planError: Error | null;
  planData: GetExitPlanResult | null;
  resetPlan: () => void;
};

/** Previews unilateral-exit readiness. Pair with useWalletExitBatch to start. */
export function useWalletExitPlan(): UseWalletExitPlanResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<GetExitPlanResult>();
  const plan = useCallback(
    (req: GetExitPlanRequest) => m.track(() => engine.getExitPlan(req)),
    [engine, m.track],
  );

  return {
    plan,
    planPending: m.pending,
    planError: m.error,
    planData: m.data,
    resetPlan: m.reset,
  };
}

/** The result of {@link useWalletList}. */
export type UseWalletListResult = {
  /** Lists wallet activity, VTXOs, or on-chain outputs. */
  list: (req: ListRequest) => Promise<ListResult>;
  listPending: boolean;
  listError: Error | null;
  listData: ListResult | null;
  resetList: () => void;
};

/** Lists wallet data on demand (e.g. VTXOs for an exit picker). */
export function useWalletList(): UseWalletListResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<ListResult>({ keepPreviousData: true });
  const list = useCallback(
    (req: ListRequest) => m.track(() => engine.list(req)),
    [engine, m.track],
  );

  return {
    list,
    listPending: m.pending,
    listError: m.error,
    listData: m.data,
    resetList: m.reset,
  };
}

/** The result of {@link useWalletExitBatch}. */
export type UseWalletExitBatchResult = {
  /**
   * Starts a batch of exits. Resolves once every exit has STARTED, not
   * completed: a unilateral exit runs for hours or days afterward.
   */
  exitBatch: (opts: ExitBatchOptions) => Promise<ExitBatchResult>;
  exitBatchPending: boolean;
  exitBatchError: Error | null;
  exitBatchData: ExitBatchResult | null;
  /** The batch's progress events, in order, for the current or last run. */
  exitBatchEvents: readonly ExitBatchEvent[];
  resetExitBatch: () => void;
};

/**
 * Orchestrates a multi-outpoint exit with funding-contention guards. Guards
 * against re-entrancy: calling `exitBatch` again while a run is already in
 * flight returns the same in-flight promise instead of starting a second
 * concurrent run (which would otherwise reset the shared event log out from
 * under the first run).
 */
export function useWalletExitBatch(): UseWalletExitBatchResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<ExitBatchResult>();
  const [events, setEvents] = useState<readonly ExitBatchEvent[]>([]);
  const inFlight = useRef<Promise<ExitBatchResult> | null>(null);
  const exitBatch = useCallback(
    (opts: ExitBatchOptions) => {
      if (inFlight.current) return inFlight.current;
      setEvents([]);
      const p = m.track(() =>
        engine.exitBatch({
          ...opts,
          onEvent: (event) => setEvents((prev) => [...prev, event]),
        }),
      );
      inFlight.current = p;
      // Clear on settle (both branches) so we never leave a stale in-flight
      // promise, and never surface an unhandled rejection here.
      void p.then(
        () => { inFlight.current = null; },
        () => { inFlight.current = null; },
      );

      return p;
    },
    [engine, m.track],
  );
  const resetExitBatch = useCallback(() => {
    setEvents([]);
    m.reset();
  }, [m.reset]);

  return {
    exitBatch,
    exitBatchPending: m.pending,
    exitBatchError: m.error,
    exitBatchData: m.data,
    exitBatchEvents: events,
    resetExitBatch,
  };
}

/** The result of {@link useWalletExits}. */
export type UseWalletExitsResult = {
  /** The wallet-wide in-progress exit portfolio, or null before first load. */
  summary: ExitSummaryResult | null;
  summaryPending: boolean;
  summaryError: Error | null;
  /** Refetches the summary on demand. */
  refreshSummary: () => Promise<ExitSummaryResult>;
};

/**
 * Reads the in-progress exit portfolio. Fetches on mount and whenever wallet
 * activity changes (so a completed exit clears without manual refresh).
 */
export function useWalletExits(): UseWalletExitsResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<ExitSummaryResult>({ keepPreviousData: true });
  const activity = useWalletSelector((s) => s.activity);
  const refreshSummary = useCallback(
    () => m.track(() => engine.exitSummary()),
    [engine, m.track],
  );
  useEffect(() => {
    void refreshSummary();
    // Refetch when the activity slice changes reference (a stream push).
  }, [refreshSummary, activity]);

  return {
    summary: m.data,
    summaryPending: m.pending,
    summaryError: m.error,
    refreshSummary,
  };
}

/** The result of {@link useWalletExitStatus}. */
export type UseWalletExitStatusResult = {
  /** The exit's status, or null before first load. */
  status: ExitStatusResult | null;
  statusPending: boolean;
  statusError: Error | null;
  /** Refetches the status on demand. */
  refreshStatus: () => Promise<ExitStatusResult>;
};

/**
 * Reads one exit's status. Defaults to the cheap phase-only call; pass
 * `{ detailed: true }` for tree progress, CSV countdown, and fees (a live
 * round-trip). Pass `{ pollMs }` to poll while the hook is mounted (a plain
 * `setInterval` with no visibility/focus gating; polling stops on unmount).
 * Fetches on mount and whenever `outpoint` or the options change.
 */
export function useWalletExitStatus(
  outpoint: string,
  opts: { detailed?: boolean; pollMs?: number } = {},
): UseWalletExitStatusResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<ExitStatusResult>({ keepPreviousData: true });
  const { detailed, pollMs } = opts;
  const refreshStatus = useCallback(
    () => m.track(() => engine.exitStatus({ outpoint, detailed })),
    [engine, m.track, outpoint, detailed],
  );
  useEffect(() => {
    void refreshStatus();
    if (!pollMs) return;
    const id = setInterval(() => void refreshStatus(), pollMs);

    return () => clearInterval(id);
  }, [refreshStatus, pollMs]);

  return {
    status: m.data,
    statusPending: m.pending,
    statusError: m.error,
    refreshStatus,
  };
}

/** The result of {@link useWalletSweep}. */
export type UseWalletSweepResult = {
  /** Previews (broadcast:false) or broadcasts (broadcast:true) a backing-wallet sweep to an address. */
  sweep: (req: SweepWalletRequest) => Promise<SweepWalletResult>;
  sweepPending: boolean;
  sweepError: Error | null;
  sweepData: SweepWalletResult | null;
  resetSweep: () => void;
};

/** Previews or broadcasts a sweep of the backing on-chain wallet. */
export function useWalletSweep(): UseWalletSweepResult {
  const engine = useWalletEngine();
  const m = useWalletMutationState<SweepWalletResult>();
  const sweep = useCallback(
    (req: SweepWalletRequest) => m.track(() => engine.sweepWallet(req)),
    [engine, m.track],
  );

  return {
    sweep,
    sweepPending: m.pending,
    sweepError: m.error,
    sweepData: m.data,
    resetSweep: m.reset,
  };
}

import { useWalletDK } from "./provider";

/**
 * Exposes the runtime client, lifecycle phase, info, and start/stop/refresh
 * actions, for components that drive the runtime itself.
 */
export function useWalletRuntime() {
  const {
    client,
    error,
    info,
    operations,
    phase,
    refresh,
    start,
    stop,
  } = useWalletDK();

  return { client, error, info, operations, phase, refresh, start, stop };
}

/**
 * Exposes wallet creation, restore, and unlock actions together with the latest
 * info and background-recovery status, for the bootstrap (create-or-unlock)
 * flow.
 */
export function useWalletBootstrap() {
  const {
    createWallet,
    restoreWallet,
    recovery,
    acknowledgeRecovery,
    info,
    operations,
    unlockWallet,
  } = useWalletDK();

  return {
    createWallet,
    restoreWallet,
    recovery,
    acknowledgeRecovery,
    info,
    operations,
    unlockWallet,
  };
}

// The single-operation hooks below expose flat busy / error / clearError for
// their one operation, matching usePasskeyWallet's shape, so consumers don't
// reach into the operations record or know its string keys.

/**
 * Exposes the current balance plus a refresh action with flat busy/error state.
 */
export function useWalletBalance() {
  const { balance, operations, refresh, clearOperationError } = useWalletDK();

  return {
    balance,
    refresh,
    busy: operations.refresh.busy,
    error: operations.refresh.error,
    clearError: () => clearOperationError("refresh"),
  };
}

/**
 * Exposes the current activity entries plus a refresh action with flat
 * busy/error state.
 */
export function useWalletActivity() {
  const { activity, operations, refresh, clearOperationError } = useWalletDK();

  return {
    activity,
    refresh,
    busy: operations.refresh.busy,
    error: operations.refresh.error,
    clearError: () => clearOperationError("refresh"),
  };
}

/** Exposes the buffered runtime log tail and a clear action. */
export function useWalletLogs() {
  const { logs, clearLogs } = useWalletDK();

  return { logs, clearLogs };
}

/**
 * Exposes the deposit action with flat busy/error state for requesting an
 * on-chain deposit address.
 */
export function useDepositAddress() {
  const { deposit, operations, clearOperationError } = useWalletDK();

  return {
    deposit,
    busy: operations.deposit.busy,
    error: operations.deposit.error,
    clearError: () => clearOperationError("deposit"),
  };
}

/**
 * Exposes the receive action with flat busy/error state for requesting a
 * Lightning receive.
 */
export function useReceive() {
  const { receive, operations, clearOperationError } = useWalletDK();

  return {
    receive,
    busy: operations.receive.busy,
    error: operations.receive.error,
    clearError: () => clearOperationError("receive"),
  };
}

/**
 * Exposes the send action with flat busy/error state for sending a payment.
 */
export function useSend() {
  const { send, operations, clearOperationError } = useWalletDK();

  return {
    send,
    busy: operations.send.busy,
    error: operations.send.error,
    clearError: () => clearOperationError("send"),
  };
}

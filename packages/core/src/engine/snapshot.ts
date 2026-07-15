import type { Balance, CreateWalletResult, Entry } from '../results.ts';
import type { WalletInfo, RuntimePhase } from '../state.ts';
import type { WavelengthLogPayload } from '../events.ts';

/**
 * The state of a background wallet recovery started by restoreWallet, a
 * discriminated union keyed on `status`: `idle` before any tracked restore
 * (and after acknowledgeRecovery); `restoring` while the daemon's
 * server-assisted scan runs; `done` once it completes (carrying the scan's
 * result counters); `failed` if either the background scan errored on an
 * already-usable wallet, or the restore itself failed before the wallet came
 * up at all. In the first case the wallet is still usable and its state just
 * may be incomplete; in the second the phase falls back to needsWallet, so
 * read the phase alongside recovery.status to disambiguate. Read it to drive
 * a "restoring your balance and history" banner, or a failure banner, across
 * a possible component unmount (the phase and recovery state live in the
 * snapshot, not hook-local state).
 */
export type RecoveryState =
  | { readonly status: 'idle' }
  | { readonly status: 'restoring' }
  | { readonly status: 'done'; readonly result: CreateWalletResult }
  | {
      readonly status: 'failed';
      readonly error: Error;
      /**
       * True when the recovery scan failed on an already-usable wallet: the
       * wallet works, but its state may be incomplete. False when the
       * restore failed before the wallet came up.
       */
      readonly walletUsable: boolean;
    };

/**
 * The engine's immutable state snapshot. A new object per change; refresh fetches
 * that changed nothing keep the previous field references, so consumers can
 * cheaply compare slices with Object.is.
 */
export type WalletSnapshot = {
  /** The current runtime/wallet lifecycle phase. */
  readonly phase: RuntimePhase;
  /** The last fatal runtime-level error, or null. */
  readonly error: Error | null;
  /** The most recent complete wallet info, or null before the runtime reports it. */
  readonly info: WalletInfo | null;
  /** The most recent wallet balance, or null before it is known. */
  readonly balance: Balance | null;
  /** The most recent activity entries, newest-first as returned by the daemon. */
  readonly activity: readonly Entry[];
  /** The background recovery status set by restoreWallet. */
  readonly recovery: RecoveryState;
  /** A bounded tail of 'log' events from the runtime, newest last. */
  readonly logs: readonly WavelengthLogPayload[];
};

/** The snapshot every engine starts from. */
export const INITIAL_SNAPSHOT: WalletSnapshot = Object.freeze<WalletSnapshot>({
  phase: 'loading',
  error: null,
  info: null,
  balance: null,
  activity: [],
  recovery: { status: 'idle' },
  logs: [],
});

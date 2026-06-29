import type {
  OpenWalletResult,
  SendResult as SendResultWire,
} from './generated';

/**
 * The result of opening a wallet from a passkey, re-exported verbatim under the
 * SDK's public name.
 */
export type OpenWalletFromPasskeyResult = OpenWalletResult;

/**
 * Augments the wire send shape with `paymentHash`, the canonical place to read
 * a Lightning payment hash for a send. The daemon returns it from prepareSend
 * (not sendPrepared), so the client folds it into `send()`'s result. Prefer this
 * field over digging into `entry.progress` / `entry.request`, and note that
 * `entry.id` is an activity id, not a payment hash.
 */
export type SendResult = SendResultWire & {
  /** The Lightning payment hash, when the send produced one. */
  paymentHash?: string;
};

/**
 * Result types re-exported verbatim from the generated daemon facade types. They
 * keep their generated names as part of the SDK's public surface.
 */
export type {
  Balance,
  CreateWalletResult,
  DepositResult,
  ExitResult,
  ExitStatusResult,
  GetExitPlanResult,
  ListResult,
  ReceiveResult,
  SweepWalletResult,
  UnlockWalletResult,
} from './generated';

/**
 * Plan- and sweep-input types re-exported verbatim from the generated daemon
 * facade types.
 */
export type { ExitPlanEntry, WalletSweepInput } from './generated';

/**
 * Activity and entry types re-exported verbatim from the generated daemon facade
 * types. These describe the wallet activity stream and its list/preview shapes.
 */
export type {
  ActivityList,
  Entry,
  EntryKind,
  EntryPhase,
  EntryStatus,
  ExitJobStatus,
  ExitPath,
  ListView,
  PrepareSendResult,
  SendRail,
} from './generated';

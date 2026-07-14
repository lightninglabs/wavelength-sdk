import type {
  OpenWalletResult,
  SendResult as SendResultWire,
} from './generated.ts';

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
} from './generated.ts';

/**
 * Detailed exit-status sub-shapes re-exported verbatim from the generated
 * daemon facade types. They populate {@link ExitStatusResult} when its request
 * sets `detailed`.
 */
export type { ExitProgress, ExitCSV, ExitFees } from './generated.ts';

/**
 * Exit portfolio types re-exported verbatim from the generated daemon facade
 * types: the wallet-wide summary and its per-exit entry.
 */
export type { ExitSummaryResult, ExitSummaryEntry } from './generated.ts';

/**
 * Plan- and sweep-input types re-exported verbatim from the generated daemon
 * facade types. `ExitInfeasibilityReason` explains why an {@link ExitPlanEntry}
 * cannot start.
 */
export type {
  ExitPlanEntry,
  ExitInfeasibilityReason,
  WalletSweepInput,
} from './generated.ts';

/**
 * Activity and entry types re-exported verbatim from the generated daemon facade
 * types. These describe the wallet activity stream and its list/preview shapes.
 */
export type {
  ActivityList,
  CreditPreview,
  Entry,
  EntryFailureCode,
  EntryKind,
  EntryPhase,
  EntryProgress,
  EntryRequest,
  EntryRequestType,
  EntryStatus,
  ExitJobStatus,
  ExitPath,
  ListView,
  OnchainHistory,
  OnchainTx,
  PrepareSendResult,
  SendRail,
  SendQuoteStatus,
  VTXOInventory,
  WalletVTXO,
} from './generated.ts';

/**
 * Generated string-enum constants for public result and activity shapes.
 */
export {
  SendRailUnspecified,
  SendRailOffchainUnknown,
  SendRailInArk,
  SendRailLightning,
  SendRailOnchain,
  SendRailCredit,
  SendRailMixed,
  SendQuoteStatusUnspecified,
  SendQuoteStatusComplete,
  SendQuoteStatusLocalOnly,
  ListViewActivity,
  ListViewVTXOs,
  ListViewOnchain,
  ExitPathCooperative,
  ExitPathUnilateral,
  ExitPathUnilateralFallback,
  ExitJobStatusUnspecified,
  ExitJobStatusPending,
  ExitJobStatusMaterializing,
  ExitJobStatusCSVPending,
  ExitJobStatusSweeping,
  ExitJobStatusCompleted,
  ExitJobStatusFailed,
  ExitInfeasibilityReasonUnspecified,
  ExitInfeasibilityReasonSweepBelowDust,
  ExitInfeasibilityReasonUneconomical,
  ExitInfeasibilityReasonWalletUnderfunded,
  ExitInfeasibilityReasonWalletTooFewInputs,
  EntryKindSend,
  EntryKindReceive,
  EntryKindDeposit,
  EntryKindExit,
  EntryStatusPending,
  EntryStatusComplete,
  EntryStatusFailed,
  EntryPhaseUnspecified,
  EntryPhaseRequestCreated,
  EntryPhaseWaitingForPayment,
  EntryPhasePaymentDetected,
  EntryPhaseSettling,
  EntryPhaseConfirmed,
  EntryPhaseRefunding,
  EntryPhaseRefunded,
  EntryPhaseFailed,
  EntryPhaseWaitingForConfirmation,
  EntryRequestTypeLightning,
  EntryRequestTypeOnchain,
  EntryRequestTypeArk,
  EntryFailureCodeTimedOut,
  EntryFailureCodeExpired,
  EntryFailureCodeRefunded,
  EntryFailureCodeNeedsIntervention,
  EntryFailureCodeFailed,
} from './generated.ts';

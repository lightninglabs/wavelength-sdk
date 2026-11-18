import type {
  OpenWalletResult,
  SendResult as SendResultWire,
} from './generated.ts';

/**
 * The result of opening a wallet from a passkey, re-exported verbatim under the
 * SDK's public name.
 */
export type OpenWalletFromPasskeyResult = OpenWalletResult;

/** The durable channel state returned by a promotion. */
export type PromoteVTXOResult = {
  /** Hex-encoded channel identifier. */
  channelId: string;
  /** The channel's lifecycle phase at the time of the reply. */
  phase: string;
  /** Funded capacity in satoshis. */
  capacitySat: number;
};

/** A settled payment made from an active Ark channel. */
export type PayOnActiveChannelResult = {
  /** Hex-encoded identifier of the paying channel. */
  channelId: string;
  /** Hex-encoded payment hash from the invoice. */
  paymentHash: string;
  /** Hex-encoded proof of payment, verified by the daemon. */
  preimage: string;
  /** Amount settled on the private channel leg, in satoshis. */
  privateAmountSat: number;
  /** Fee paid, in satoshis. */
  feeSat: number;
};

/** Result of atomically starting and opening an external-seed daemon wallet. */
export type ExternalSeedWalletOpenResult = {
  /** True when the seed was imported into a new local profile. */
  imported: boolean;
  /** The daemon identity for this wallet. */
  identityPubKey: string;
  /** True when this open operation ran a state-recovery scan. */
  recoveryRan: boolean;
  /** Number of boarding addresses found by recovery. */
  recoveredBoardingAddresses: number;
  /** Number of boarding UTXOs found by recovery. */
  recoveredBoardingUTXOs: number;
  /** Number of Ark VTXOs found by recovery. */
  recoveredVTXOs: number;
  /** Number of out-of-round receive scripts found by recovery. */
  recoveredOORReceiveScripts: number;
  /** Number of out-of-round recipient events found by recovery. */
  recoveredOORRecipientEvents: number;
};

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

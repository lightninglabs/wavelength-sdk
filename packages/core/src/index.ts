// The framework-agnostic contract for Wavelength. This file is a thin barrel that
// re-exports the package's public API from the per-concern modules below; the
// definitions live there. See each module for the documented symbols.

// Runtime events and the subscriber callback.
export type {
  ActivityStreamPayload,
  ActivityStreamState,
  WavelengthEvent,
  WavelengthEventType,
  WavelengthListener,
  WavelengthLogLevel,
  WavelengthLogPayload,
} from './events.ts';

// Network selection and runtime configuration. App code normally builds a
// config through a transport package's defaultConfig helper; networkDefaults
// is the shared endpoint table those helpers compose over.
export {
  DEBUG_LEVELS,
  networkDefaults,
  validateRuntimeConfig,
} from './config.ts';
export type {
  DebugLevel,
  Network,
  PresetNetwork,
  RuntimeConfig,
} from './config.ts';

// Wallet lifecycle state and the phases a UI renders.
export { WalletState, normalizeInfo, phaseFromInfo, walletStateFromProto } from './state.ts';
export type {
  RuntimePhase,
  WalletInfo,
  WalletPhase,
  WalletStatus,
} from './state.ts';

// Request shapes for the client's typed methods.
export type {
  CreateWalletRequest,
  DepositRequest,
  ExitRequest,
  ExitStatusRequest,
  ExitSummaryRequest,
  GetExitPlanRequest,
  ListRequest,
  OpenWalletFromPasskeyRequest,
  ReceiveRequest,
  RestoreWalletRequest,
  SendRequest,
  SweepWalletRequest,
  UnlockWalletRequest,
} from './requests.ts';
export { FORCE_UNROLL_ACK } from './requests.ts';
export type { ActivityStreamOptions } from './activity-options.ts';

// Result shapes (a couple SDK-augmented, the rest re-exported from generated).
export type {
  ActivityList,
  Balance,
  CreateWalletResult,
  CreditPreview,
  DepositResult,
  Entry,
  EntryFailureCode,
  EntryKind,
  EntryPhase,
  EntryProgress,
  EntryRequest,
  EntryRequestType,
  EntryStatus,
  ExitCSV,
  ExitFees,
  ExitInfeasibilityReason,
  ExitJobStatus,
  ExitPath,
  ExitPlanEntry,
  ExitProgress,
  ExitResult,
  ExitStatusResult,
  ExitSummaryEntry,
  ExitSummaryResult,
  GetExitPlanResult,
  ListResult,
  ListView,
  OnchainHistory,
  OnchainTx,
  OpenWalletFromPasskeyResult,
  PrepareSendResult,
  ReceiveResult,
  SendRail,
  SendQuoteStatus,
  SendResult,
  SweepWalletResult,
  UnlockWalletResult,
  VTXOInventory,
  WalletVTXO,
  WalletSweepInput,
} from './results.ts';
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
} from './results.ts';

// The client contract every transport implements.
export type { WavelengthClient } from './client.ts';

// The transport-agnostic half of the client, for transport implementers:
// extend it and supply invokeFacade, ready, the activity plumbing, and the
// transport flavor.
export { BaseWavelengthClient } from './base-client.ts';

// The SDK error type and its machine-readable codes.
export {
  WavelengthError,
  errorMessage,
  isPasskeyCancelled,
  PasskeyCancelledError,
  toError,
} from './errors.ts';
export type { WavelengthErrorCode } from './errors.ts';

// Passkey contract types, the wallet-kind label, and the shared PRF salt.
export { PASSKEY_PRF_NAMESPACE, PASSKEY_PRF_SALT_HEX } from './passkey.ts';
export type {
  PasskeyAssertion,
  PasskeyCeremony,
  WalletKind,
} from './passkey.ts';

// The daemon facade method catalog shared by every transport.
export { FACADE_METHODS, base64FromUtf8 } from './facade.ts';
export type { FacadeMethod } from './facade.ts';

// The daemon build this SDK release is paired with (generated types and
// runtime assets alike).
export { RUNTIME_MANIFEST_VERSION } from './version.ts';

// BaseWavelengthClient applies camelizeKeys once to every facade response.
// Transports should return daemon-shaped values instead of normalizing them.
export { camelizeKeys } from './casing.ts';

// classifyDestination decides which fields a send UI should render for a pasted
// destination. It never names a settlement rail; read that from prepareSend.
export { classifyDestination } from './destination.ts';
export type { Destination, InvoiceAmount } from './destination.ts';

// The headless wallet engine: the framework-agnostic orchestrator that React
// (and future bindings) subscribe to. Most apps construct one through a
// transport factory (createWebWalletEngine / createNativeWalletEngine).
export { createWalletEngine } from './engine/engine.ts';
export type { DistributiveOmit, WalletEngine, WalletEngineOptions } from './engine/engine.ts';
export type { RecoveryState, WalletSnapshot } from './engine/snapshot.ts';

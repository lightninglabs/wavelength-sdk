// The framework-agnostic contract for WalletDK. This file is a thin barrel that
// re-exports the package's public API from the per-concern modules below; the
// definitions live there. See each module for the documented symbols.

// Runtime events and the subscriber callback.
export type {
  ActivityStreamPayload,
  ActivityStreamState,
  WalletDKEvent,
  WalletDKEventType,
  WalletDKListener,
  WalletDKLogLevel,
  WalletDKLogPayload,
} from './events.ts';

// Network selection and runtime configuration. App code normally builds a
// config through a transport package's defaultConfig helper; networkDefaults
// is the shared endpoint table those helpers compose over.
export { DEBUG_LEVELS, networkDefaults } from './config.ts';
export type { DebugLevel, Network, PresetNetwork, RuntimeConfig } from './config.ts';

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
  GetExitPlanRequest,
  ListRequest,
  OpenWalletFromPasskeyRequest,
  ReceiveRequest,
  RestoreWalletRequest,
  SendRequest,
  SweepWalletRequest,
  UnlockWalletRequest,
} from './requests.ts';

// Result shapes (a couple SDK-augmented, the rest re-exported from generated).
export type {
  ActivityList,
  Balance,
  CreateWalletResult,
  DepositResult,
  Entry,
  EntryKind,
  EntryPhase,
  EntryStatus,
  ExitJobStatus,
  ExitPath,
  ExitPlanEntry,
  ExitResult,
  ExitStatusResult,
  GetExitPlanResult,
  ListResult,
  ListView,
  OpenWalletFromPasskeyResult,
  PrepareSendResult,
  ReceiveResult,
  SendRail,
  SendResult,
  SweepWalletResult,
  UnlockWalletResult,
  WalletSweepInput,
} from './results.ts';

// The client contract every transport implements.
export type { WalletDKClient } from './client.ts';

// The transport-agnostic half of the client, for transport implementers:
// extend it and supply callRaw, ready, the activity plumbing, and the
// transport flavor.
export { BaseWalletDKClient } from './base-client.ts';

// The SDK error type and its machine-readable codes.
export {
  WalletDKError,
  errorMessage,
  isPasskeyCancelled,
  PasskeyCancelledError,
  toError,
} from './errors.ts';
export type { WalletDKErrorCode } from './errors.ts';

// Passkey contract types, the wallet-kind label, and the shared PRF salt.
export { PASSKEY_PRF_NAMESPACE, PASSKEY_PRF_SALT_HEX } from './passkey.ts';
export type {
  PasskeyAssertion,
  PasskeyCeremony,
  WalletKind,
} from './passkey.ts';

// The daemon facade protocol shared by every transport: the flat Start config
// and the Go-shaped request mappers. Transport implementers use these; app
// code normally does not.
export {
  base64FromUtf8,
  toGoCreateWalletReq,
  toGoUnlockWalletReq,
  toMobileConfig,
} from './facade.ts';
export type { MobileConfig, ServerTransport } from './facade.ts';

// The daemon build this SDK release is paired with (generated types and
// runtime assets alike).
export { RUNTIME_MANIFEST_VERSION } from './version.ts';

// camelizeKeys maps a daemon PascalCase JSON response to the SDK's camelCase
// shapes; every transport applies it at its response boundary.
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

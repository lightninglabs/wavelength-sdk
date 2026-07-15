import {
  EntryFailureCodeFailed,
  EntryKindSend,
  EntryPhaseSettling,
  EntryRequestTypeLightning,
  EntryStatusPending,
  ExitInfeasibilityReasonUneconomical,
  ExitJobStatusPending,
  ExitPathUnilateral,
  FACADE_METHODS,
  FORCE_UNROLL_ACK,
  ListViewActivity,
  SendQuoteStatusComplete,
  SendRailLightning,
} from './index.ts';
import type {
  ActivityStreamOptions,
  CreditPreview,
  DebugLevel,
  EntryFailureCode,
  EntryProgress,
  EntryRequest,
  EntryRequestType,
  FacadeMethod,
  OnchainHistory,
  OnchainTx,
  RuntimeConfig,
  SendQuoteStatus,
  VTXOInventory,
  WalletVTXO,
} from './index.ts';
import type * as Core from './index.ts';

type AssertNotExported<Name extends string> = Extract<Name, keyof typeof Core> extends never
  ? true
  : never;

const noProhibitedFacadeExports: AssertNotExported<
  | 'MobileConfig'
  | 'ServerTransport'
  | 'toGoCreateWalletReq'
  | 'toGoUnlockWalletReq'
  | 'toMobileConfig'
> = true;

const method: FacadeMethod = FACADE_METHODS[0];
const activityOptions: ActivityStreamOptions = { kinds: [EntryKindSend], cursor: 0 };
const acknowledgement: typeof FORCE_UNROLL_ACK = 'I_KNOW_WHAT_I_AM_DOING';
const subsystemDebugConfig: RuntimeConfig = { debugLevel: 'ROND=debug,info' };
const pickerDebugLevel: DebugLevel = 'info';
// @ts-expect-error subsystem expressions are runtime config, not picker levels.
const subsystemPickerLevel: DebugLevel = 'ROND=debug,info';

void method;
void activityOptions;
void acknowledgement;
void subsystemDebugConfig;
void pickerDebugLevel;
void subsystemPickerLevel;
void noProhibitedFacadeExports;
void [
  EntryFailureCodeFailed,
  EntryPhaseSettling,
  EntryRequestTypeLightning,
  EntryStatusPending,
  ExitInfeasibilityReasonUneconomical,
  ExitJobStatusPending,
  ExitPathUnilateral,
  ListViewActivity,
  SendQuoteStatusComplete,
  SendRailLightning,
];
void (null as unknown as CreditPreview);
void (null as unknown as EntryFailureCode);
void (null as unknown as EntryProgress);
void (null as unknown as EntryRequest);
void (null as unknown as EntryRequestType);
void (null as unknown as OnchainHistory);
void (null as unknown as OnchainTx);
void (null as unknown as SendQuoteStatus);
void (null as unknown as VTXOInventory);
void (null as unknown as WalletVTXO);

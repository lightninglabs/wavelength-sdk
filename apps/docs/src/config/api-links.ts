export interface ApiLinkTarget {
  href: string;
  symbol: string;
}

type ReferencePage = 'core' | 'react' | 'web' | 'react-native';

const pagePaths: Record<ReferencePage, string> = {
  core: '/reference/wavelength-core/',
  react: '/reference/wavelength-react/',
  web: '/reference/wavelength-web/',
  'react-native': '/reference/wavelength-react-native/',
};

const coreSymbols = [
  'RuntimeConfig', 'Network', 'WavelengthClient', 'ready', 'start', 'stop',
  'dispose', 'createWalletEngine', 'WalletEngine', 'WalletSnapshot', 'RecoveryState',
  'RestoreWalletRequest', 'createWallet', 'unlockWallet', 'openWalletFromPasskey',
  'getInfo', 'status', 'balance', 'WalletInfo', 'WalletStatus', 'Balance', 'ServerInfo', 'deposit',
  'receive', 'prepareSend', 'sendPrepared', 'send', 'SendRequest', 'PrepareSendResult',
  'SendResult', 'SendRail', 'classifyDestination', 'Destination', 'InvoiceAmount',
  'list', 'subscribe', 'startActivity', 'stopActivity', 'Entry', 'EntryProgress',
  'EntryRequest', 'EntryKind', 'EntryStatus', 'EntryPhase', 'EntryFailureCode',
  'EntryRequestType', 'exit', 'exitStatus', 'exitSummary', 'getExitPlan', 'exitBatch',
  'isExitInfeasibilityFundable', 'ExitBatchOptions', 'ExitBatchEvent', 'ExitBatchStop',
  'ExitBatchResult', 'sweepWallet', 'callRaw',
  'camelizeKeys', 'WalletState', 'RuntimePhase', 'phaseFromInfo', 'normalizeInfo',
  'walletStateFromProto', 'WavelengthEvent', 'WavelengthEventType', 'WavelengthListener',
  'WavelengthLogPayload', 'WavelengthLogLevel', 'WavelengthError', 'WavelengthErrorCode',
  'PasskeyCancelledError', 'toError', 'WalletKind', 'PasskeyAssertion', 'PasskeyCeremony',
  'WalletEngineOptions', 'CreateWalletRequest', 'CreateWalletResult', 'UnlockWalletRequest',
  'UnlockWalletResult', 'OpenWalletFromPasskeyRequest', 'OpenWalletFromPasskeyResult',
  'DepositRequest', 'DepositResult', 'ReceiveRequest', 'ReceiveResult', 'ListRequest',
  'ListResult', 'ListView', 'ActivityList', 'VTXOInventory', 'WalletVTXO', 'OnchainHistory',
  'OnchainTx', 'ExitRequest', 'ExitResult', 'ExitPath', 'ExitStatusRequest',
  'ExitStatusResult', 'ExitProgress', 'ExitCSV', 'ExitFees', 'ExitJobStatus',
  'ExitSummaryRequest', 'ExitSummaryResult', 'ExitSummaryEntry',
  'GetExitPlanRequest', 'GetExitPlanResult', 'ExitPlanEntry',
  'ExitInfeasibilityReason', 'SweepWalletRequest', 'SweepWalletResult', 'WalletSweepInput',
  'ActivityStreamPayload', 'ActivityStreamState', 'WalletPhase', 'ServerTransport',
  'MobileConfig', 'DistributiveOmit',
];

const reactSymbols = [
  'WavelengthProvider', 'WavelengthProviderProps', 'useWalletEngine', 'useWallet',
  'useWalletInfo', 'useWalletBalance', 'useWalletActivity', 'useWalletRecovery',
  'useWalletLogs', 'useWalletCreate', 'useWalletRestore', 'useWalletUnlock',
  'useWalletDeposit', 'useWalletReceive', 'useWalletPrepareSend', 'useWalletSend',
  'useWalletRefresh', 'useWalletPasskey', 'PasskeyWalletOutcome',
  'useWalletExit', 'useWalletExitPlan', 'useWalletExitBatch', 'useWalletExitStatus',
  'useWalletExits', 'useWalletList', 'useWalletSweep',
];

const webSymbols = [
  'createWebClient', 'WebClientOptions', 'RuntimeThread', 'createWebWalletEngine',
  'MainThreadWavelengthClient', 'RUNTIME_ASSETS', 'RUNTIME_ASSET_FILES',
  'RUNTIME_MANIFEST_VERSION', 'webPasskeyCeremony', 'supportsPasskeyPrf',
  'registerPasskeyWallet', 'assertPasskeyPrf',
  'WebWalletEngineOptions',
];

const nativeSymbols = [
  'createNativeClient', 'createNativeWalletEngine', 'createNativePasskeyCeremony',
  'NativePasskeyCeremonyOptions', 'getDefaultDataDir',
  'NativeWalletEngineOptions',
];

const targets = new Map<string, ApiLinkTarget>();

const addTargets = (page: ReferencePage, symbols: readonly string[]) => {
  const base = pagePaths[page];
  for (const symbol of symbols) {
    targets.set(symbol, { href: `${base}#${symbol}`, symbol });
  }
};

addTargets('core', coreSymbols);
addTargets('react', reactSymbols);
addTargets('web', webSymbols);
addTargets('react-native', nativeSymbols);

// These types are documented inline beneath their owning API symbol rather
// than as standalone ApiSymbol sections. Their links still land at the most
// relevant definition instead of silently becoming plain code.
const inlineTypeOwners: Record<string, string> = {
  WalletEngineOptions: 'createWalletEngine',
  WebWalletEngineOptions: 'createWebWalletEngine',
  NativeWalletEngineOptions: 'createNativeWalletEngine',
  CreateWalletRequest: 'createWallet',
  CreateWalletResult: 'createWallet',
  UnlockWalletRequest: 'unlockWallet',
  UnlockWalletResult: 'unlockWallet',
  OpenWalletFromPasskeyRequest: 'openWalletFromPasskey',
  OpenWalletFromPasskeyResult: 'openWalletFromPasskey',
  DepositRequest: 'deposit',
  DepositResult: 'deposit',
  ReceiveRequest: 'receive',
  ReceiveResult: 'receive',
  ListRequest: 'list',
  ListResult: 'list',
  ExitRequest: 'exit',
  ExitResult: 'exit',
  ExitStatusRequest: 'exitStatus',
  ExitStatusResult: 'exitStatus',
  ExitProgress: 'exitStatus',
  ExitCSV: 'exitStatus',
  ExitFees: 'exitStatus',
  ExitSummaryRequest: 'exitSummary',
  ExitSummaryResult: 'exitSummary',
  ExitSummaryEntry: 'exitSummary',
  GetExitPlanRequest: 'getExitPlan',
  GetExitPlanResult: 'getExitPlan',
  ExitInfeasibilityReason: 'getExitPlan',
  SweepWalletRequest: 'sweepWallet',
  SweepWalletResult: 'sweepWallet',
};

for (const [symbol, owner] of Object.entries(inlineTypeOwners)) {
  const target = targets.get(owner);
  if (target && !targets.has(symbol)) targets.set(symbol, { href: target.href, symbol });
}

const simpleSymbol = /^[A-Za-z_$][\w$]*$/;

export function resolveApiLink(symbol: string): ApiLinkTarget | undefined {
  if (!simpleSymbol.test(symbol)) return undefined;
  return targets.get(symbol);
}

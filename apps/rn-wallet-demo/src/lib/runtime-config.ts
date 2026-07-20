import { Platform } from 'react-native';
import { defaultConfig } from '@lightninglabs/wavelength-react-native';
import type { DebugLevel } from '@lightninglabs/wavelength-react';

// The Android emulator reaches the host machine as 10.0.2.2; the iOS
// simulator shares the host loopback.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

// NETWORKS are the selectable runtime networks. Mainnet is intentionally
// excluded: this build targets test networks only.
export const NETWORKS = ['signet', 'testnet', 'regtest'] as const;

// RuntimeNetwork is the demo's selectable network union. RuntimeConfig.network
// is optional and includes 'mainnet', so RuntimeForm narrows it to this
// required, test-only union for controlled pickers.
export type RuntimeNetwork = (typeof NETWORKS)[number];

// RuntimeForm is the fully-populated runtime config the connect/settings forms
// edit (every field required so inputs are always controlled). The native
// transport speaks gRPC, so the server fields are host:port addresses, not
// REST URLs; dataDir starts empty and is filled from getDefaultDataDir().
export type RuntimeForm = {
  network: RuntimeNetwork;
  dataDir: string;
  allowMainnet: boolean;
  arkServerAddress: string;
  walletEsploraUrl: string;
  swapServerAddress: string;
  swapDatabaseFileName: string;
  arkServerInsecure: boolean;
  swapServerInsecure: boolean;
  disableSwaps: boolean;
  debugLevel: DebugLevel;
};

// RuntimeFieldSetter updates a single field of the runtime form, preserving
// the value type of that field (string or boolean).
export type RuntimeFieldSetter = <K extends keyof RuntimeForm>(
  key: K,
  value: RuntimeForm[K],
) => void;

// demoFieldDefaults are the demo-only fields layered under every network
// preset so the connect/settings forms are always fully populated.
const demoFieldDefaults = {
  dataDir: '',
  allowMainnet: false,
  // An empty value lets the daemon choose its own location for the swap
  // database. A bare relative filename resolves against the process working
  // directory on native, which on Android is the filesystem root and hangs
  // runtime startup indefinitely.
  swapDatabaseFileName: '',
  arkServerInsecure: false,
  swapServerInsecure: false,
  disableSwaps: false,
  debugLevel: 'info' as DebugLevel,
};

// hostedDefaults builds the form for a hosted test network from the SDK's own
// gRPC preset, so the demo never hand-copies server addresses. The hosted
// deployments speak TLS and also work on physical devices.
function hostedDefaults(network: 'signet' | 'testnet'): RuntimeForm {
  const preset = defaultConfig(network);

  return {
    ...demoFieldDefaults,
    network,
    arkServerAddress: preset.arkServerAddress ?? '',
    walletEsploraUrl: preset.walletEsploraUrl ?? '',
    swapServerAddress: preset.swapServerAddress ?? '',
  };
}

// signetDefaults are the default runtime servers for the signet test network.
export const signetDefaults: RuntimeForm = hostedDefaults('signet');

// testnetDefaults are the default runtime servers for Bitcoin testnet3.
export const testnetDefaults: RuntimeForm = hostedDefaults('testnet');

// regtestDefaults target the local frontend-regtest stack over plaintext gRPC.
// The SDK ships no regtest preset (local ports vary per machine), so this
// form is fully demo-local.
export const regtestDefaults: RuntimeForm = {
  ...demoFieldDefaults,
  network: 'regtest',
  arkServerAddress: `${HOST}:7070`,
  walletEsploraUrl: `http://${HOST}:8501`,
  swapServerAddress: `${HOST}:10030`,
  arkServerInsecure: true,
  swapServerInsecure: true,
  debugLevel: 'debug',
};

// defaultsForNetwork returns the preset runtime form for a network selection.
export function defaultsForNetwork(network: RuntimeNetwork): RuntimeForm {
  switch (network) {
    case 'regtest':
      return regtestDefaults;
    case 'testnet':
      return testnetDefaults;
    default:
      return signetDefaults;
  }
}

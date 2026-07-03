import { Platform } from 'react-native';
import { RuntimeConfig } from '@lightninglabs/walletdk-react';

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
export type RuntimeForm = Omit<Required<RuntimeConfig>, 'network'> & {
  network: RuntimeNetwork;
};

// RuntimeFieldSetter updates a single field of the runtime form, preserving
// the value type of that field (string or boolean).
export type RuntimeFieldSetter = <K extends keyof RuntimeForm>(
  key: K,
  value: RuntimeForm[K],
) => void;

// signetDefaults target the public signet deployment over TLS; they also work
// on physical devices.
export const signetDefaults: RuntimeForm = {
  network: 'signet',
  dataDir: '',
  allowMainnet: false,
  arkServerUrl: 'arkd-signet.testnet.lightningcluster.com:443',
  esploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
  swapServerUrl: 'swapd-signet.testnet.lightningcluster.com:443',
  // An empty value lets the daemon choose its own location for the swap
  // database. A bare relative filename resolves against the process working
  // directory on native, which on Android is the filesystem root and hangs
  // runtime startup indefinitely.
  swapDatabaseFileName: '',
  serverInsecure: false,
  swapServerInsecure: false,
  disableSwaps: false,
  debugLevel: 'info',
};

// testnetDefaults are the Bitcoin testnet3 gateways.
export const testnetDefaults: RuntimeForm = {
  ...signetDefaults,
  network: 'testnet',
  arkServerUrl: 'arkd.testnet.lightningcluster.com:443',
  esploraUrl: 'https://mempool.space/testnet/api',
  swapServerUrl: 'swapd.testnet.lightningcluster.com:443',
};

// regtestDefaults target the local frontend-regtest stack over plaintext gRPC.
export const regtestDefaults: RuntimeForm = {
  ...signetDefaults,
  network: 'regtest',
  arkServerUrl: `${HOST}:7070`,
  esploraUrl: `http://${HOST}:8501`,
  swapServerUrl: `${HOST}:10030`,
  serverInsecure: true,
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

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
// is optional and includes 'mainnet', so this narrows it to a required,
// test-only union for controlled pickers.
export type RuntimeNetwork = (typeof NETWORKS)[number];

// WalletEndpoints is the per-wallet server endpoint snapshot, chosen at
// wallet creation and stored on the registry entry, never edited afterwards.
export type WalletEndpoints = {
  arkServerAddress: string;
  walletEsploraUrl: string;
  swapServerAddress: string;
  arkServerInsecure: boolean;
  swapServerInsecure: boolean;
  debugLevel: DebugLevel;
};

// regtestEndpoints target the local frontend-regtest overlay through the
// platform's host alias (the Android emulator reaches the host machine via
// 10.0.2.2). These are demo-local; they prefill the editable advanced fields
// on the create screen when regtest is selected.
const regtestEndpoints: WalletEndpoints = {
  arkServerAddress: `${HOST}:7070`,
  walletEsploraUrl: `http://${HOST}:8501`,
  swapServerAddress: `${HOST}:10030`,
  arkServerInsecure: true,
  swapServerInsecure: true,
  debugLevel: 'debug',
};

// endpointsForNetwork returns the endpoint preset for a network: the SDK's
// hosted gRPC preset for signet/testnet, the local overlay for regtest.
export function endpointsForNetwork(network: RuntimeNetwork): WalletEndpoints {
  if (network === 'regtest') {
    return { ...regtestEndpoints };
  }
  const preset = defaultConfig(network);

  return {
    arkServerAddress: preset.arkServerAddress ?? '',
    walletEsploraUrl: preset.walletEsploraUrl ?? '',
    swapServerAddress: preset.swapServerAddress ?? '',
    arkServerInsecure: false,
    swapServerInsecure: false,
    debugLevel: 'info',
  };
}

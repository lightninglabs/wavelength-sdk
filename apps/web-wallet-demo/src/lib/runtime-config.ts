import { defaultConfig } from "@lightninglabs/wavelength-web";
import type { DebugLevel } from "@lightninglabs/wavelength-react";

// NETWORKS are the selectable runtime networks. Mainnet is intentionally
// excluded - this build targets test networks only. regtest is a hidden dev
// option (see lib/devGate.ts).
export const NETWORKS = ["signet", "testnet", "regtest"] as const;
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

// regtestEndpoints target the local frontend-regtest overlay. The SDK ships
// no regtest preset (local ports vary per machine), so these are demo-local;
// the swap gateway uses host port 10032 because waved's default HTTP gateway
// also binds localhost:10031. They prefill the editable advanced fields on
// the create screen when regtest is selected.
const regtestEndpoints: WalletEndpoints = {
  arkServerAddress: "http://127.0.0.1:7071",
  walletEsploraUrl: "http://127.0.0.1:8501",
  swapServerAddress: "http://127.0.0.1:10032",
  arkServerInsecure: true,
  swapServerInsecure: true,
  debugLevel: "debug",
};

// endpointsForNetwork returns the endpoint preset for a network: the SDK's
// hosted REST preset for signet/testnet, the local overlay for regtest.
export function endpointsForNetwork(network: RuntimeNetwork): WalletEndpoints {
  if (network === "regtest") {
    return { ...regtestEndpoints };
  }
  const preset = defaultConfig(network);

  return {
    arkServerAddress: preset.arkServerAddress ?? "",
    walletEsploraUrl: preset.walletEsploraUrl ?? "",
    swapServerAddress: preset.swapServerAddress ?? "",
    arkServerInsecure: false,
    swapServerInsecure: false,
    debugLevel: "info",
  };
}

// hostname extracts the host from a URL for compact display, falling back to
// the raw value when it is not a parseable URL.
export function hostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

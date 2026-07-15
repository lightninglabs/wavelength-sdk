import { defaultConfig } from "@lightninglabs/wavelength-web";
import { RuntimeConfig } from "@lightninglabs/wavelength-react";

// NETWORKS are the selectable runtime networks. Mainnet is intentionally
// excluded - this build targets test networks only.
export const NETWORKS = ["signet", "testnet", "testnet4", "regtest"] as const;

// RuntimeNetwork is the demo's selectable network union. RuntimeConfig.network is
// a plain string, so RuntimeForm narrows it for controlled network pickers.
export type RuntimeNetwork = (typeof NETWORKS)[number];

// RuntimeForm is the fully-populated runtime config the connect/settings forms
// edit (every field required so inputs are always controlled).
export type RuntimeForm = Omit<Required<RuntimeConfig>, "network"> & {
  network: RuntimeNetwork;
};

// RuntimeFieldSetter updates a single field of the runtime form, preserving the
// value type of that field (string or boolean).
export type RuntimeFieldSetter = <K extends keyof RuntimeForm>(
  key: K,
  value: RuntimeForm[K],
) => void;

// demoFieldDefaults are the demo-only fields layered under every network
// preset so the connect/settings forms are always fully populated.
const demoFieldDefaults = {
  dataDir: "/walletdk-demo",
  allowMainnet: false,
  swapDatabaseFileName: "/walletdk-swaps.db",
  serverInsecure: false,
  swapServerInsecure: false,
  disableSwaps: false,
  debugLevel: "info",
};

// hostedDefaults builds the form for a hosted test network from the SDK's own
// REST preset, so the demo never hand-copies gateway URLs.
function hostedDefaults(
  network: "signet" | "testnet" | "testnet4",
): RuntimeForm {
  const preset = defaultConfig(network);

  return {
    ...demoFieldDefaults,
    network,
    arkServerUrl: preset.arkServerUrl ?? "",
    esploraUrl: preset.esploraUrl ?? "",
    swapServerUrl: preset.swapServerUrl ?? "",
  };
}

// signetDefaults are the default runtime gateways for the signet test network.
export const signetDefaults: RuntimeForm = hostedDefaults("signet");

// testnetDefaults are the default runtime gateways for Bitcoin testnet3.
export const testnetDefaults: RuntimeForm = hostedDefaults("testnet");

// testnet4Defaults are the default runtime gateways for Bitcoin testnet4.
export const testnet4Defaults: RuntimeForm = hostedDefaults("testnet4");

// regtestDefaults target the local frontend-regtest swapdk overlay
// (regtest swapdk info). The SDK ships no regtest preset (local ports vary
// per machine), so this form is fully demo-local; swap gateway uses host
// port 10032 because darepod's default HTTP gateway also binds
// localhost:10031.
export const regtestDefaults: RuntimeForm = {
  ...demoFieldDefaults,
  network: "regtest",
  arkServerUrl: "http://127.0.0.1:7071",
  esploraUrl: "http://127.0.0.1:8501",
  swapServerUrl: "http://127.0.0.1:10032",
  serverInsecure: true,
  swapServerInsecure: true,
  debugLevel: "debug",
};

// defaultsForNetwork returns the preset runtime form for a network selection.
export function defaultsForNetwork(network: RuntimeNetwork): RuntimeForm {
  switch (network) {
  case "regtest":
    return regtestDefaults;
  case "testnet":
    return testnetDefaults;
  case "testnet4":
    return testnet4Defaults;
  default:
    return signetDefaults;
  }
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

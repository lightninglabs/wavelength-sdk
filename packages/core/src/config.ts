import type { ServerTransport } from './facade.ts';

/**
 * Selects the Bitcoin network the embedded daemon runs against. Names match
 * the daemon's network selector: 'testnet' is Bitcoin testnet3 and 'testnet4'
 * is Bitcoin testnet4.
 */
export type Network =
  | 'mainnet'
  | 'testnet'
  | 'testnet4'
  | 'signet'
  | 'regtest';

/**
 * The networks that carry a public endpoint preset, and so can be passed to a
 * transport package's defaultConfig helper. mainnet and regtest are excluded:
 * mainnet has no public deployment yet, and regtest's ports vary per
 * development environment. A {@link RuntimeConfig} for either is built by hand.
 */
export type PresetNetwork = 'testnet' | 'testnet4' | 'signet';

/**
 * The daemon log verbosity levels accepted by {@link RuntimeConfig.debugLevel},
 * from most to least verbose. Exported for UIs that render a level picker.
 * debugLevel itself stays a plain string because the daemon also accepts a
 * per-subsystem list such as 'ROND=debug,info'.
 */
export const DEBUG_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'critical',
  'off',
] as const;

/** One of the daemon log verbosity levels in {@link DEBUG_LEVELS}. */
export type DebugLevel = (typeof DEBUG_LEVELS)[number];

/**
 * The configuration passed to `client.start()`. For the common case prefer
 * the defaultConfig helper exported by your transport package (walletdk-web
 * or walletdk-react-native), which preloads the canonical public endpoints
 * in that transport's flavor, and override only the fields you need.
 */
export type RuntimeConfig = {
  /** The Bitcoin network to run against. Required. Use 'mainnet' only together with allowMainnet. */
  network?: Network;
  /** Must be true to run on mainnet; ignored on test networks. The daemon refuses to start on mainnet without it. */
  allowMainnet?: boolean;
  /** Storage root for daemon and wallet state (an OPFS path in the browser). A daemon default is used when unset. */
  dataDir?: string;
  /** The Ark operator's mailbox edge server: its REST gateway URL in the browser, or a host:port gRPC address on the native transport. Required to reach the Ark network. */
  arkServerUrl?: string;
  /** The Esplora REST endpoint the lightweight wallet uses for chain data. Required. */
  esploraUrl?: string;
  /** The Lightning swap server: its REST gateway URL in the browser, or a host:port gRPC address on the native transport. Leave unset (or set disableSwaps) to run without Lightning swaps. */
  swapServerUrl?: string;
  /** Advanced. The daemon-owned SQLite file for swap state; a sensible default is used when unset. */
  swapDatabaseFileName?: string;
  /** Advanced. Disables TLS for the Ark server connection; for local development only. */
  serverInsecure?: boolean;
  /** Advanced. Disables TLS for the swap server connection; for local development only. */
  swapServerInsecure?: boolean;
  /** Turns off the Lightning swap subsystem entirely. */
  disableSwaps?: boolean;
  /** The daemon's log verbosity (e.g. 'info', 'debug'). Distinct from the client's RPC-payload debug option. See {@link DEBUG_LEVELS}. */
  debugLevel?: string;
};

/**
 * The endpoints of one hosted service in both transport flavors: a REST
 * gateway URL for the web transport and a host:port gRPC address for native
 * transports.
 */
type ServiceEndpoints = Record<ServerTransport, string>;

/**
 * The canonical public deployment of one network, mirroring the daemon's own
 * per-network defaults. The Esplora endpoint is a plain HTTP API on every
 * transport, so it carries a single URL.
 */
type NetworkEndpoints = {
  ark: ServiceEndpoints;
  swap: ServiceEndpoints;
  esplora: string;
};

// The hosted public deployments per network, mirroring the daemon's own
// per-network defaults. Record over PresetNetwork so that adding a preset
// network without its endpoints here is a compile error.
const NETWORK_ENDPOINTS: Record<PresetNetwork, NetworkEndpoints> = {
  signet: {
    ark: {
      rest: 'https://arkd-signet-rest.staging.lightningcluster.com',
      grpc: 'arkd-signet.staging.lightningcluster.com:443',
    },
    swap: {
      rest: 'https://swapd-signet-rest.staging.lightningcluster.com',
      grpc: 'swapd-signet.staging.lightningcluster.com:443',
    },
    esplora: 'https://mempool-signet.testnet.lightningcluster.com/api',
  },
  testnet: {
    ark: {
      rest: 'https://arkd-rest.testnet.lightningcluster.com',
      grpc: 'arkd.testnet.lightningcluster.com:443',
    },
    swap: {
      rest: 'https://swapd-rest.testnet.lightningcluster.com',
      grpc: 'swapd.testnet.lightningcluster.com:443',
    },
    esplora: 'https://mempool.space/testnet/api',
  },
  testnet4: {
    ark: {
      rest: 'https://arkd-testnet4-rest.testnet.lightningcluster.com',
      grpc: 'arkd-testnet4.testnet.lightningcluster.com:443',
    },
    swap: {
      rest: 'https://swapd-testnet4-rest.testnet.lightningcluster.com',
      grpc: 'swapd-testnet4.testnet.lightningcluster.com:443',
    },
    esplora: 'https://mempool.space/testnet4/api',
  },
};

/**
 * Returns the canonical public endpoint preset for a network in one
 * transport's flavor: REST gateway URLs for 'rest' (the web transport),
 * host:port gRPC addresses for 'grpc' (native transports). This is the
 * building block the transport packages' defaultConfig helpers compose over;
 * app code normally calls those instead.
 *
 * Only the preset networks are accepted (see {@link PresetNetwork}); mainnet
 * and regtest have no preset and their {@link RuntimeConfig} is built by hand.
 *
 * @param network - The Bitcoin network to look up.
 * @param transport - The endpoint flavor the caller's transport dials.
 * @returns The preset config fields for that network and transport.
 */
export function networkDefaults(
  network: PresetNetwork,
  transport: ServerTransport,
): Partial<RuntimeConfig> {
  const endpoints = NETWORK_ENDPOINTS[network];

  return {
    arkServerUrl: endpoints.ark[transport],
    esploraUrl: endpoints.esplora,
    swapServerUrl: endpoints.swap[transport],
  };
}

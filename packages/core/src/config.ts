/**
 * Selects the Bitcoin network the embedded daemon runs against.
 */
export type Network = 'mainnet' | 'testnet' | 'signet' | 'regtest';

/**
 * The configuration passed to `client.start()`. For the common case prefer
 * {@link defaultConfig}, which preloads the canonical public endpoints, and
 * override only the fields you need.
 */
export type RuntimeConfig = {
  /** The Bitcoin network to run against. Required. Use 'mainnet' only together with allowMainnet. */
  network?: Network;
  /** Must be true to run on mainnet; ignored on test networks. The daemon refuses to start on mainnet without it. */
  allowMainnet?: boolean;
  /** Storage root for daemon and wallet state (an OPFS path in the browser). A daemon default is used when unset. */
  dataDir?: string;
  /** The Ark operator's mailbox edge server (its REST gateway in the browser). Required to reach the Ark network. */
  arkServerUrl?: string;
  /** The Esplora REST endpoint the lightweight wallet uses for chain data. Required. */
  esploraUrl?: string;
  /** The Lightning swap server's REST gateway. Leave unset (or set disableSwaps) to run without Lightning swaps. */
  swapServerUrl?: string;
  /** Advanced. The daemon-owned SQLite file for swap state; a sensible default is used when unset. */
  swapDatabaseFileName?: string;
  /** Advanced. Disables TLS for the Ark server connection; for local development only. */
  serverInsecure?: boolean;
  /** Advanced. Disables TLS for the swap server connection; for local development only. */
  swapServerInsecure?: boolean;
  /** Turns off the Lightning swap subsystem entirely. */
  disableSwaps?: boolean;
  /** The daemon's log verbosity (e.g. 'info', 'debug'). Distinct from the client's RPC-payload debug option. */
  debugLevel?: string;
};

/**
 * Holds the canonical public gateway endpoints per network, so the common case
 * is {@link defaultConfig} with no URLs to look up. mainnet has no public preset
 * yet; supply the endpoints (and allowMainnet) yourself.
 */
const NETWORK_PRESETS: Record<Network, Partial<RuntimeConfig>> = {
  signet: {
    arkServerUrl: 'https://arkd-signet-rest.testnet.lightningcluster.com',
    esploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
    swapServerUrl: 'https://swapd-signet-rest.testnet.lightningcluster.com',
  },
  testnet: {
    arkServerUrl: 'https://arkd-rest.testnet.lightningcluster.com',
    esploraUrl: 'https://mempool.space/testnet/api',
    swapServerUrl: 'https://swapd-rest.testnet.lightningcluster.com',
  },
  regtest: {
    arkServerUrl: 'http://127.0.0.1:7071',
    esploraUrl: 'http://127.0.0.1:8501',
    swapServerUrl: 'http://127.0.0.1:10032',
    serverInsecure: true,
    swapServerInsecure: true,
  },
  mainnet: {},
};

/**
 * Returns a ready-to-use {@link RuntimeConfig} for a network, preloaded with the
 * canonical public gateway endpoints and merged with any overrides. Pass
 * overrides to set dataDir or point at your own infrastructure, e.g.
 * `defaultConfig('signet', { dataDir: 'my-wallet' })`.
 *
 * @param network - The Bitcoin network to build a config for.
 * @param overrides - Fields that override the network preset's defaults.
 * @returns The merged runtime configuration.
 */
export function defaultConfig(
  network: Network,
  overrides: Partial<RuntimeConfig> = {},
): RuntimeConfig {
  return { network, ...NETWORK_PRESETS[network], ...overrides };
}

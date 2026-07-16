import type { ServerTransport } from './facade.ts';
import { WavelengthError } from './errors.ts';

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
 * the defaultConfig helper exported by your transport package (wavelength-web
 * or wavelength-react-native), which preloads the canonical public endpoints
 * in that transport's flavor, and override only the fields you need.
 */
export type RuntimeConfig = {
  /** The Bitcoin network to run against. `mainnet` also requires {@link allowMainnet}. */
  network?: Network;
  /** Explicitly permits mainnet. The SDK rejects mainnet configs unless this is true. */
  allowMainnet?: boolean;
  /**
   * Storage root for daemon and wallet state. This is an OPFS path on web and
   * a filesystem path on React Native. The daemon chooses a default when unset.
   */
  dataDir?: string;
  /**
   * Daemon log verbosity. Accepts a standard {@link DebugLevel} or a
   * per-subsystem expression such as `ROND=debug,info`.
   */
  debugLevel?: string;
  /**
   * Ark operator and mailbox endpoint. Use a REST URL on web and a `host:port`
   * gRPC address on React Native. The daemon network default is used when unset.
   */
  arkServerAddress?: string;
  /** Filesystem path to an Ark TLS certificate. The web transport rejects it. */
  arkServerTlsCertPath?: string;
  /** Disables TLS for the Ark endpoint. Use only for local development. */
  arkServerInsecure?: boolean;
  /** Embedded wallet backend. Defaults to `lwwallet`. */
  walletType?: 'lwwallet' | 'btcwallet';
  /** HTTP Esplora endpoint used by the `lwwallet` backend on both platforms. */
  walletEsploraUrl?: string;
  /** Password file used by `lwwallet` to unlock automatically. */
  walletPasswordFile?: string;
  /**
   * Chain polling interval in seconds for `lwwallet`. Must be a nonnegative
   * safe integer.
   */
  walletPollIntervalSeconds?: number;
  /**
   * Wallet address look-ahead window for either backend. Must be a
   * nonnegative safe integer that fits in a uint32.
   */
  walletRecoveryWindow?: number;
  /** Fee estimator endpoint used by the `btcwallet` backend. */
  walletFeeUrl?: string;
  /**
   * Local file path or HTTP(S) URL from which `btcwallet` imports block
   * headers on startup.
   */
  walletBlockHeadersSource?: string;
  /**
   * Local file path or HTTP(S) URL from which `btcwallet` imports compact
   * filter headers on startup.
   */
  walletFilterHeadersSource?: string;
  /**
   * Lightning swap endpoint. Use a REST URL on web and a `host:port` gRPC
   * address on React Native. The daemon network default is used when unset.
   */
  swapServerAddress?: string;
  /**
   * Filesystem path to a swap-server TLS certificate. Web rejects it unless
   * swaps are disabled, in which case every swap field is omitted.
   */
  swapServerTlsCertPath?: string;
  /** Disables TLS for the swap endpoint. Use only for local development. */
  swapServerInsecure?: boolean;
  /** Path to the daemon-owned SQLite database that stores swap state. */
  swapDatabaseFileName?: string;
  /** Disables Lightning swaps and omits every swap configuration field. */
  disableSwaps?: boolean;
  /**
   * Maximum per-round operator fee the daemon accepts, in satoshis. Must be a
   * nonnegative safe integer.
   */
  maxOperatorFeeSat?: number;
  /**
   * Maximum concurrent VTXO signing sessions. Zero selects the wallet-backend
   * default and one forces serial signing.
   */
  signingWorkers?: number;
  /** Bufconn listener buffer size override. Must be a nonnegative safe integer. */
  bufferSize?: number;
};

const lwwalletOnly = [
  'walletEsploraUrl',
  'walletPasswordFile',
  'walletPollIntervalSeconds',
] as const;
const btcwalletOnly = [
  'walletFeeUrl',
  'walletBlockHeadersSource',
  'walletFilterHeadersSource',
] as const;
const numericFields = [
  'walletPollIntervalSeconds',
  'walletRecoveryWindow',
  'maxOperatorFeeSat',
  'signingWorkers',
  'bufferSize',
] as const;

function invalidConfig(message: string): never {
  throw new WavelengthError(message, 'invalid_config');
}

/** Validates host-owned runtime settings before the typed start dispatches. */
export function validateRuntimeConfig(
  config: RuntimeConfig,
  transport: ServerTransport,
): void {
  const walletType = config.walletType ?? 'lwwallet';
  if (walletType !== 'lwwallet' && walletType !== 'btcwallet') {
    invalidConfig(`unsupported walletType: ${String(walletType)}`);
  }
  if (config.network === 'mainnet' && config.allowMainnet !== true) {
    invalidConfig('mainnet requires allowMainnet: true');
  }
  if (walletType === 'lwwallet') {
    for (const field of btcwalletOnly) {
      if (config[field] !== undefined) {
        invalidConfig(`${field} applies only to walletType btcwallet`);
      }
    }
  } else {
    for (const field of lwwalletOnly) {
      if (config[field] !== undefined) {
        invalidConfig(`${field} applies only to walletType lwwallet`);
      }
    }
  }
  for (const field of numericFields) {
    const value = config[field];
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < 0)
    ) {
      invalidConfig(`${field} must be a nonnegative safe integer`);
    }
  }
  if (
    config.walletRecoveryWindow !== undefined &&
    config.walletRecoveryWindow > 0xffff_ffff
  ) {
    invalidConfig('walletRecoveryWindow must fit in uint32');
  }
  if (transport === 'rest' && config.arkServerTlsCertPath !== undefined) {
    invalidConfig('arkServerTlsCertPath is unavailable on the web transport');
  }
  if (
    transport === 'rest' &&
    !config.disableSwaps &&
    config.swapServerTlsCertPath !== undefined
  ) {
    invalidConfig('swapServerTlsCertPath is unavailable on the web transport');
  }
}

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
      rest: 'https://signet.wavelength-rest.lightning.finance',
      grpc: 'signet.wavelength.lightning.finance:443',
    },
    swap: {
      rest: 'https://signet.swapd-rest.lightning.finance',
      grpc: 'signet.swap.wavelength.lightning.finance:443',
    },
    esplora: 'https://mempool.space/signet/api',
  },
  testnet: {
    ark: {
      rest: 'https://test.wavelength-rest.lightning.finance',
      grpc: 'test.wavelength.lightning.finance:443',
    },
    swap: {
      rest: 'https://test.swapd-rest.lightning.finance',
      grpc: 'test.swap.wavelength.lightning.finance:443',
    },
    esplora: 'https://mempool.space/testnet/api',
  },
  testnet4: {
    ark: {
      rest: 'https://test4.wavelength-rest.lightning.finance',
      // testnet4's public gRPC NLB is still disabled, so the daemon keeps
      // dialing the raw cluster hostname; a friendly-domain CNAME follows
      // once its certificate work lands.
      grpc: 'lumosd-testnet4.testnet.lightningcluster.com:443',
    },
    swap: {
      rest: 'https://test4.swapd-rest.lightning.finance',
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
    arkServerAddress: endpoints.ark[transport],
    walletEsploraUrl: endpoints.esplora,
    swapServerAddress: endpoints.swap[transport],
  };
}

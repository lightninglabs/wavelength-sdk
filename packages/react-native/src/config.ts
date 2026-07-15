import {
  networkDefaults,
  type PresetNetwork,
  type RuntimeConfig,
} from '@lightninglabs/wavelength-core';

/**
 * Returns a ready-to-use {@link RuntimeConfig} for a network on the React
 * Native transport, preloaded with the canonical public gRPC host:port
 * addresses and merged with any overrides. Pass overrides to set dataDir or
 * point at your own infrastructure, e.g.
 * `defaultConfig('signet', { dataDir: '/wallet' })`.
 *
 * Only the preset networks are accepted (see {@link PresetNetwork}). mainnet
 * and regtest have no preset: build their config by hand, mainnet with your
 * own gRPC addresses and allowMainnet, regtest with local addresses and the
 * insecure-transport flags.
 *
 * @param network - The Bitcoin network to build a config for.
 * @param overrides - Fields that override the network preset's defaults.
 * @returns The merged runtime configuration.
 */
export function defaultConfig(
  network: PresetNetwork,
  overrides: Partial<RuntimeConfig> = {},
): RuntimeConfig {
  return { network, ...networkDefaults(network, 'grpc'), ...overrides };
}

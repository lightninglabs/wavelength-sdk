import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEBUG_LEVELS,
  networkDefaults,
  validateRuntimeConfig,
  type RuntimeConfig,
} from './config.ts';
import { WavelengthError } from './errors.ts';
import type { ServerTransport } from './facade.ts';

describe('networkDefaults', () => {
  it('returns the signet staging endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('signet', 'rest'), {
      arkServerAddress: 'https://arkd-signet-rest.staging.lightningcluster.com',
      walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
      swapServerAddress: 'https://swapd-signet-rest.staging.lightningcluster.com',
    });
    assert.deepEqual(networkDefaults('signet', 'grpc'), {
      arkServerAddress: 'arkd-signet.staging.lightningcluster.com:443',
      walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
      swapServerAddress: 'swapd-signet.staging.lightningcluster.com:443',
    });
  });

  it('returns the testnet (testnet3) endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('testnet', 'rest'), {
      arkServerAddress: 'https://arkd-rest.testnet.lightningcluster.com',
      walletEsploraUrl: 'https://mempool.space/testnet/api',
      swapServerAddress: 'https://swapd-rest.testnet.lightningcluster.com',
    });
    assert.deepEqual(networkDefaults('testnet', 'grpc'), {
      arkServerAddress: 'arkd.testnet.lightningcluster.com:443',
      walletEsploraUrl: 'https://mempool.space/testnet/api',
      swapServerAddress: 'swapd.testnet.lightningcluster.com:443',
    });
  });

  it('returns the testnet4 endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('testnet4', 'rest'), {
      arkServerAddress: 'https://arkd-testnet4-rest.testnet.lightningcluster.com',
      walletEsploraUrl: 'https://mempool.space/testnet4/api',
      swapServerAddress: 'https://swapd-testnet4-rest.testnet.lightningcluster.com',
    });
    assert.deepEqual(networkDefaults('testnet4', 'grpc'), {
      arkServerAddress: 'arkd-testnet4.testnet.lightningcluster.com:443',
      walletEsploraUrl: 'https://mempool.space/testnet4/api',
      swapServerAddress: 'swapd-testnet4.testnet.lightningcluster.com:443',
    });
  });
});

describe('validateRuntimeConfig', () => {
  const invalid: Array<[string, RuntimeConfig, ServerTransport]> = [
    ['mainnet gate', { network: 'mainnet' }, 'grpc'],
    ['invalid backend', { walletType: 'lnd' as never }, 'grpc'],
    ['lwwallet with btcwallet field', { walletFeeUrl: 'https://fees' }, 'grpc'],
    [
      'btcwallet with lwwallet field',
      { walletType: 'btcwallet', walletEsploraUrl: 'https://esplora' },
      'grpc',
    ],
    ['web Ark cert path', { arkServerTlsCertPath: '/tmp/ark.pem' }, 'rest'],
    ['web swap cert path', { swapServerTlsCertPath: '/tmp/swap.pem' }, 'rest'],
    ['fractional buffer', { bufferSize: 1.5 }, 'grpc'],
    ['negative workers', { signingWorkers: -1 }, 'grpc'],
    ['unsafe fee', { maxOperatorFeeSat: Number.MAX_SAFE_INTEGER + 1 }, 'grpc'],
    [
      'uint32 recovery overflow',
      { walletRecoveryWindow: 0x1_0000_0000 },
      'grpc',
    ],
  ];

  for (const [name, config, transport] of invalid) {
    it(`rejects ${name}`, () => {
      assert.throws(
        () => validateRuntimeConfig(config, transport),
        (err: WavelengthError) => err.code === 'invalid_config',
      );
    });
  }

  it('accepts zero for every numeric field', () => {
    assert.doesNotThrow(() =>
      validateRuntimeConfig(
        {
          walletPollIntervalSeconds: 0,
          walletRecoveryWindow: 0,
          maxOperatorFeeSat: 0,
          signingWorkers: 0,
          bufferSize: 0,
        },
        'grpc',
      ),
    );
  });

  it('lets disableSwaps suppress explicit swap fields and a REST cert path', () => {
    assert.doesNotThrow(() =>
      validateRuntimeConfig(
        {
          disableSwaps: true,
          swapServerAddress: 'ignored:443',
          swapServerTlsCertPath: '/ignored/swap.pem',
        },
        'rest',
      ),
    );
  });
});

describe('DEBUG_LEVELS', () => {
  it('lists the daemon log levels from most to least verbose', () => {
    assert.deepEqual(
      [...DEBUG_LEVELS],
      ['trace', 'debug', 'info', 'warn', 'error', 'critical', 'off'],
    );
  });
});

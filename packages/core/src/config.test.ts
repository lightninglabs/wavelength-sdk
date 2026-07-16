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
  it('returns the signet endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('signet', 'rest'), {
      arkServerAddress: 'https://signet.wavelength-rest.lightning.finance',
      walletEsploraUrl: 'https://mempool.space/signet/api',
      swapServerAddress: 'https://signet.swapd-rest.lightning.finance',
    });
    assert.deepEqual(networkDefaults('signet', 'grpc'), {
      arkServerAddress: 'signet.wavelength.lightning.finance:443',
      walletEsploraUrl: 'https://mempool.space/signet/api',
      swapServerAddress: 'signet.swap.wavelength.lightning.finance:443',
    });
  });

  it('returns the testnet (testnet3) endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('testnet', 'rest'), {
      arkServerAddress: 'https://test.wavelength-rest.lightning.finance',
      walletEsploraUrl: 'https://mempool.space/testnet/api',
      swapServerAddress: 'https://test.swapd-rest.lightning.finance',
    });
    assert.deepEqual(networkDefaults('testnet', 'grpc'), {
      arkServerAddress: 'test.wavelength.lightning.finance:443',
      walletEsploraUrl: 'https://mempool.space/testnet/api',
      swapServerAddress: 'test.swap.wavelength.lightning.finance:443',
    });
  });

  it('returns the testnet4 endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('testnet4', 'rest'), {
      arkServerAddress: 'https://test4.wavelength-rest.lightning.finance',
      walletEsploraUrl: 'https://mempool.space/testnet4/api',
      swapServerAddress: 'https://test4.swapd-rest.lightning.finance',
    });
    assert.deepEqual(networkDefaults('testnet4', 'grpc'), {
      arkServerAddress: 'lumosd-testnet4.testnet.lightningcluster.com:443',
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

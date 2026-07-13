import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEBUG_LEVELS, networkDefaults } from './config.ts';

describe('networkDefaults', () => {
  it('returns the signet staging endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('signet', 'rest'), {
      arkServerUrl: 'https://arkd-signet-rest.staging.lightningcluster.com',
      esploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
      swapServerUrl: 'https://swapd-signet-rest.staging.lightningcluster.com',
    });
    assert.deepEqual(networkDefaults('signet', 'grpc'), {
      arkServerUrl: 'arkd-signet.staging.lightningcluster.com:443',
      esploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
      swapServerUrl: 'swapd-signet.staging.lightningcluster.com:443',
    });
  });

  it('returns the testnet (testnet3) endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('testnet', 'rest'), {
      arkServerUrl: 'https://arkd-rest.testnet.lightningcluster.com',
      esploraUrl: 'https://mempool.space/testnet/api',
      swapServerUrl: 'https://swapd-rest.testnet.lightningcluster.com',
    });
    assert.deepEqual(networkDefaults('testnet', 'grpc'), {
      arkServerUrl: 'arkd.testnet.lightningcluster.com:443',
      esploraUrl: 'https://mempool.space/testnet/api',
      swapServerUrl: 'swapd.testnet.lightningcluster.com:443',
    });
  });

  it('returns the testnet4 endpoints in each flavor', () => {
    assert.deepEqual(networkDefaults('testnet4', 'rest'), {
      arkServerUrl: 'https://arkd-testnet4-rest.testnet.lightningcluster.com',
      esploraUrl: 'https://mempool.space/testnet4/api',
      swapServerUrl: 'https://swapd-testnet4-rest.testnet.lightningcluster.com',
    });
    assert.deepEqual(networkDefaults('testnet4', 'grpc'), {
      arkServerUrl: 'arkd-testnet4.testnet.lightningcluster.com:443',
      esploraUrl: 'https://mempool.space/testnet4/api',
      swapServerUrl: 'swapd-testnet4.testnet.lightningcluster.com:443',
    });
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

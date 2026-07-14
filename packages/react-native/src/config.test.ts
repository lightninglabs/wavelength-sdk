import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultConfig } from './config.ts';

describe('defaultConfig (react-native)', () => {
  it('returns the gRPC host:port preset for a hosted network', () => {
    assert.deepEqual(defaultConfig('signet'), {
      network: 'signet',
      arkServerAddress: 'arkd-signet.staging.lightningcluster.com:443',
      walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
      swapServerAddress: 'swapd-signet.staging.lightningcluster.com:443',
    });
  });

  it('merges overrides over the preset', () => {
    const config = defaultConfig('testnet4', { dataDir: '/wallet' });
    assert.equal(config.network, 'testnet4');
    assert.equal(config.dataDir, '/wallet');
    assert.equal(
      config.arkServerAddress,
      'arkd-testnet4.testnet.lightningcluster.com:443',
    );
    assert.equal(
      config.swapServerAddress,
      'swapd-testnet4.testnet.lightningcluster.com:443',
    );
  });
});

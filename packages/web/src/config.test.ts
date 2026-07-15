import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultConfig } from './config.ts';

describe('defaultConfig (web)', () => {
  it('returns the REST gateway preset for a hosted network', () => {
    assert.deepEqual(defaultConfig('signet'), {
      network: 'signet',
      arkServerAddress: 'https://arkd-signet-rest.staging.lightningcluster.com',
      walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
      swapServerAddress: 'https://swapd-signet-rest.staging.lightningcluster.com',
    });
  });

  it('merges overrides over the preset', () => {
    const config = defaultConfig('testnet4', {
      dataDir: 'my-wallet',
      walletEsploraUrl: 'https://my-esplora.example/api',
    });
    assert.equal(config.network, 'testnet4');
    assert.equal(config.dataDir, 'my-wallet');
    assert.equal(config.walletEsploraUrl, 'https://my-esplora.example/api');
    assert.equal(
      config.arkServerAddress,
      'https://arkd-testnet4-rest.testnet.lightningcluster.com',
    );
  });
});

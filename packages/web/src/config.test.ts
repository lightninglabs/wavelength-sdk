import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultConfig } from './config.ts';

describe('defaultConfig (web)', () => {
  it('returns the REST gateway preset for a hosted network', () => {
    assert.deepEqual(defaultConfig('signet'), {
      network: 'signet',
      arkServerAddress: 'https://signet.wavelength-rest.lightning.finance',
      walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
      swapServerAddress: 'https://signet.swapd-rest.lightning.finance',
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
      'https://test4.wavelength-rest.lightning.finance',
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRuntimeConfig } from '@lightninglabs/wavelength-core';
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

  it('builds a startable mainnet config when allowMainnet is set', () => {
    const config = defaultConfig('mainnet', { allowMainnet: true });
    assert.deepEqual(config, {
      network: 'mainnet',
      arkServerAddress: 'https://wavelength-rest.lightning.finance',
      walletEsploraUrl: 'https://mempool.staging.lightningcluster.com/api',
      swapServerAddress: 'https://swapd-rest.lightning.finance',
      allowMainnet: true,
    });
    assert.doesNotThrow(() => validateRuntimeConfig(config, 'rest'));
  });

  it('leaves a mainnet config without allowMainnet rejected', () => {
    assert.throws(
      () => validateRuntimeConfig(defaultConfig('mainnet'), 'rest'),
      /mainnet requires allowMainnet: true/,
    );
  });
});

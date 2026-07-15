import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base64FromUtf8,
  toGoCreateWalletReq,
  toGoUnlockWalletReq,
  toMobileConfig,
} from './facade.ts';

describe('base64FromUtf8', () => {
  it('matches node base64 output for ascii and multibyte input', () => {
    for (const value of ['', 'abc', 'p@ssw0rd!', 'héllo wörld', '密码🔑']) {
      assert.equal(
        base64FromUtf8(value),
        Buffer.from(value, 'utf8').toString('base64'),
        `mismatch for ${JSON.stringify(value)}`,
      );
    }
  });
});

describe('toMobileConfig', () => {
  it('applies the server transport to both the ark and swap servers', () => {
    const out = toMobileConfig(
      {
        network: 'regtest',
        arkServerUrl: '10.0.2.2:7070',
        esploraUrl: 'http://10.0.2.2:8501',
        swapServerUrl: '10.0.2.2:10030',
      },
      'grpc',
    );
    assert.equal(out.server_transport, 'grpc');
    assert.equal(out.swap_server_transport, 'grpc');
    assert.equal(out.server_address, '10.0.2.2:7070');
    assert.equal(out.wallet_type, 'lwwallet');
  });

  it('maps every field of a fully populated config', () => {
    // An exhaustive shape pin: a snake_case typo in any mapping would show
    // up as a silently dropped daemon setting, so assert the whole object.
    const out = toMobileConfig(
      {
        network: 'regtest',
        allowMainnet: false,
        dataDir: '/data/wavelength',
        debugLevel: 'debug',
        arkServerUrl: '10.0.2.2:7070',
        esploraUrl: 'http://10.0.2.2:8501',
        serverInsecure: true,
        swapServerUrl: '10.0.2.2:10030',
        swapServerInsecure: true,
        swapDatabaseFileName: 'swaps.db',
      },
      'grpc',
    );
    assert.deepEqual(out, {
      network: 'regtest',
      allow_mainnet: false,
      data_dir: '/data/wavelength',
      debug_level: 'debug',
      wallet_type: 'lwwallet',
      wallet_esplora_url: 'http://10.0.2.2:8501',
      server_address: '10.0.2.2:7070',
      server_transport: 'grpc',
      server_insecure: true,
      swap_server_address: '10.0.2.2:10030',
      swap_server_transport: 'grpc',
      swap_server_insecure: true,
      swap_database_file_name: 'swaps.db',
    });
  });

  it('carries the swap address under the rest transport too', () => {
    const out = toMobileConfig(
      {
        network: 'signet',
        arkServerUrl: 'https://ark.example',
        swapServerUrl: 'https://swap.example',
      },
      'rest',
    );
    assert.equal(out.server_transport, 'rest');
    assert.equal(out.swap_server_address, 'https://swap.example');
    assert.equal(out.swap_server_transport, 'rest');
  });

  it('omits every swap field when swaps are disabled', () => {
    const out = toMobileConfig(
      { network: 'signet', disableSwaps: true, swapServerUrl: 'ignored:443' },
      'rest',
    );
    assert.equal(out.swap_server_address, undefined);
    assert.equal(out.swap_server_transport, undefined);
  });
});

describe('toGoUnlockWalletReq', () => {
  it('base64-encodes the password for the Go byte field', () => {
    const out = toGoUnlockWalletReq({ password: 'héllo' });
    assert.equal(
      out.WalletPassword,
      Buffer.from('héllo', 'utf8').toString('base64'),
    );
  });

  it('leaves an absent password undefined', () => {
    assert.equal(toGoUnlockWalletReq({ password: '' }).WalletPassword, undefined);
  });
});

describe('toGoCreateWalletReq', () => {
  it('base64-encodes the password and passphrase for the Go byte fields', () => {
    const out = toGoCreateWalletReq({
      password: 'héllo',
      mnemonic: ['ab', 'cd'],
      seedPassphrase: 'p',
    });
    assert.equal(out.WalletPassword, Buffer.from('héllo', 'utf8').toString('base64'));
    assert.equal(out.SeedPassphrase, Buffer.from('p', 'utf8').toString('base64'));
    assert.deepEqual(out.Mnemonic, ['ab', 'cd']);
  });

  it('omits the recovery fields when unset so the daemon defaults apply', () => {
    const out = toGoCreateWalletReq({ password: 'pw' });
    assert.equal(out.RecoverState, undefined);
    assert.equal(out.RecoveryWindow, undefined);
  });

  it('threads recovery opt-in and window through as PascalCase fields', () => {
    const out = toGoCreateWalletReq({
      password: 'pw',
      mnemonic: ['ab', 'cd'],
      recoverState: true,
      recoveryWindow: 250,
    });
    assert.equal(out.RecoverState, true);
    assert.equal(out.RecoveryWindow, 250);
  });
});

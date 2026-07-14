import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base64FromUtf8,
  toGoCreateWalletReq,
  toGoUnlockWalletReq,
  toMobileConfig,
} from './facade.ts';
import type { RuntimeConfig } from './config.ts';

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
  it('maps every field of a fully populated config', () => {
    // An exhaustive shape pin: a snake_case typo in any mapping would show
    // up as a silently dropped daemon setting, so assert the whole object.
    assert.deepEqual(
      toMobileConfig(
        {
          network: 'regtest',
          allowMainnet: false,
          dataDir: '/data/wavelength',
          debugLevel: 'debug',
          arkServerAddress: '10.0.2.2:7070',
          arkServerTlsCertPath: '/certs/ark.pem',
          arkServerInsecure: true,
          walletType: 'btcwallet',
          walletPasswordFile: '/secrets/wallet.pass',
          walletRecoveryWindow: 250,
          walletFeeUrl: 'https://fees.example',
          walletBlockHeadersSource: 'neutrino',
          walletFilterHeadersSource: 'neutrino',
          swapServerAddress: '10.0.2.2:10030',
          swapServerTlsCertPath: '/certs/swap.pem',
          swapServerInsecure: true,
          swapDatabaseFileName: 'swaps.db',
          maxOperatorFeeSat: 100,
          signingWorkers: 4,
          bufferSize: 64,
        },
        'grpc',
      ),
      {
        data_dir: '/data/wavelength',
        network: 'regtest',
        debug_level: 'debug',
        allow_mainnet: false,
        server_address: '10.0.2.2:7070',
        server_tls_cert_path: '/certs/ark.pem',
        server_transport: 'grpc',
        server_insecure: true,
        wallet_type: 'btcwallet',
        wallet_password_file: '/secrets/wallet.pass',
        wallet_recovery_window: 250,
        wallet_fee_url: 'https://fees.example',
        wallet_block_headers_source: 'neutrino',
        wallet_filter_headers_source: 'neutrino',
        swap_server_address: '10.0.2.2:10030',
        swap_server_tls_cert_path: '/certs/swap.pem',
        swap_server_transport: 'grpc',
        swap_server_insecure: true,
        swap_database_file_name: 'swaps.db',
        max_operator_fee_sat: 100,
        signing_workers: 4,
        buffer_size: 64,
      },
    );
  });

  it('maps lightweight-wallet fields', () => {
    const out = toMobileConfig(
      {
        walletEsploraUrl: 'https://esplora.example/api',
        walletPasswordFile: '/secrets/wallet.pass',
        walletPollIntervalSeconds: 15,
      },
      'rest',
    );
    assert.equal(out.wallet_type, 'lwwallet');
    assert.equal(out.wallet_esplora_url, 'https://esplora.example/api');
    assert.equal(out.wallet_password_file, '/secrets/wallet.pass');
    assert.equal(out.wallet_poll_interval_seconds, 15);
  });

  it('omits every swap field when swaps are disabled', () => {
    const out = toMobileConfig(
      {
        network: 'signet',
        disableSwaps: true,
        swapServerAddress: 'ignored:443',
        swapServerTlsCertPath: '/ignored/swap.pem',
        swapServerInsecure: true,
        swapDatabaseFileName: 'ignored.db',
      },
      'rest',
    );
    assert.deepEqual(
      Object.keys(out).filter((key) => key.startsWith('swap_')),
      [],
    );
  });

  it('ignores caller-supplied transport-shaped extras', () => {
    const out = toMobileConfig(
      {
        network: 'signet',
        server_transport: 'grpc',
        swap_server_transport: 'grpc',
      } as RuntimeConfig,
      'rest',
    );
    assert.equal(out.server_transport, 'rest');
    assert.equal(out.swap_server_transport, 'rest');
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

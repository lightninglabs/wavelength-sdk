import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BaseWavelengthClient } from './base-client.ts';
import type { WavelengthEvent } from './events.ts';
import { FACADE_METHODS, type FacadeMethod } from './facade.ts';
import { WavelengthError } from './errors.ts';
import { FORCE_UNROLL_ACK } from './requests.ts';
import type { ActivityStreamOptions } from './activity-options.ts';

// A fake transport that records every raw facade invocation and replays canned
// responses, so the verb mapping is testable without any runtime.
class FakeClient extends BaseWavelengthClient {
  protected readonly serverTransport = 'grpc' as const;
  calls: Array<{ method: string; params: unknown }> = [];
  responses = new Map<string, unknown>();
  activityOpens: ActivityStreamOptions[] = [];

  ready(): Promise<void> {
    return Promise.resolve();
  }

  protected invokeFacade<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    this.calls.push({ method, params });
    const response = this.responses.get(method);
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve((response ?? {}) as T);
  }

  protected openActivityStream(opts: ActivityStreamOptions): Promise<void> {
    this.activityOpens.push(opts);
    return Promise.resolve();
  }

  stopActivity(): void {}
}

describe('BaseWavelengthClient', () => {
  it('callFacade accepts every portable method and rejects worker/raw verbs', async () => {
    const client = new FakeClient();
    for (const method of FACADE_METHODS) {
      // Lifecycle verbs are guarded (asserted separately below); they run only
      // through their typed methods.
      if (
        method === 'start' ||
        method === 'startExternalSeedWallet' ||
        method === 'stop'
      ) {
        continue;
      }
      await client.callFacade(method);
    }
    await assert.rejects(
      () => (client.callFacade as (method: string) => Promise<unknown>)('subscribe'),
      (err: WavelengthError) => err.code === 'unsupported_facade_method',
    );
    await assert.rejects(
      () => (client.callFacade as (method: string) => Promise<unknown>)('$ready'),
      (err: WavelengthError) => err.code === 'unsupported_facade_method',
    );
  });

  it('callFacade rejects the lifecycle verbs so the runtime lock is not bypassed', async () => {
    const client = new FakeClient();
    const lifecycleCalls = [
      ['start', 'start()'],
      [
        'startExternalSeedWallet',
        'ExternalSeedWalletClient.startExternalSeedWallet()',
      ],
      ['stop', 'stop()'],
    ] as const;
    for (const [verb, typedCall] of lifecycleCalls) {
      await assert.rejects(
        () => client.callFacade(verb),
        (err: unknown) => {
          assert.ok(err instanceof WavelengthError);
          assert.ok(err.message.includes(`Call ${typedCall}`));

          return true;
        },
      );
      // The guard rejects before anything reaches the transport.
      assert.equal(client.calls.some((call) => call.method === verb), false);
    }

    // The typed methods still dispatch the same verbs through the internal path.
    client.responses.set('getInfo', { walletState: 2 });
    await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
    await client.stop();
    assert.deepEqual(
      client.calls.map((call) => call.method),
      ['start', 'getInfo', 'stop'],
    );
  });

  it('callFacade normalizes raw facade values once in core', async () => {
    const client = new FakeClient();
    client.responses.set('list', {
      View: 'activity',
      Activity: { Entries: null },
      VTXOs: null,
      Onchain: null,
    });
    assert.deepEqual(await client.callFacade('list'), {
      view: 'activity',
      activity: { entries: [] },
      vtxos: undefined,
      onchain: undefined,
    });
  });

  it('isRunning returns the facade boolean', async () => {
    const client = new FakeClient();
    client.responses.set('isRunning', true);
    assert.equal(await client.isRunning(), true);
  });
  it('start maps the config through the transport knob and fetches info', async () => {
    const client = new FakeClient();
    client.responses.set('getInfo', { walletState: 2 });
    await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });

    const start = client.calls[0];
    assert.equal(start.method, 'start');
    const cfg = start.params as { server_transport?: string; server_address?: string };
    assert.equal(cfg.server_transport, 'grpc');
    assert.equal(cfg.server_address, 'h:7070');
    assert.equal(client.calls[1].method, 'getInfo');
  });

  it('rejects invalid config before facade start dispatch', async () => {
    const client = new FakeClient();
    await assert.rejects(
      () => client.start({ network: 'mainnet' }),
      (err: WavelengthError) => err.code === 'invalid_config',
    );
    assert.equal(client.calls.some((call) => call.method === 'start'), false);
  });

  it('maps external seed startup to the private snake-case envelope', async () => {
    const client = new FakeClient();
    client.responses.set('startExternalSeedWallet', {
      Imported: true,
      IdentityPubKey: 'identity',
    });
    const entropy = Uint8Array.from({ length: 16 }, (_, index) => index);
    const result = await client.startExternalSeedWallet(
      {
        network: 'regtest',
        dataDir: '/wallets',
        arkServerAddress: 'h:7070',
      },
      {
        seedEntropy: entropy,
        expectedIdentityPubKey: 'identity',
        recoverState: true,
        recoveryWindow: 99,
      },
    );

    assert.deepEqual(client.calls[0], {
      method: 'startExternalSeedWallet',
      params: {
        config: {
          data_dir: '/wallets',
          network: 'regtest',
          server_address: 'h:7070',
          server_transport: 'grpc',
          swap_server_transport: 'grpc',
          wallet_type: 'lwwallet',
        },
        seed_entropy: Buffer.from(entropy).toString('base64'),
        expected_identity_pubkey: 'identity',
        recover_state: true,
        recovery_window: 99,
      },
    });
    assert.equal(result.identityPubKey, 'identity');
    assert.equal(Object.hasOwn(result, 'mnemonic'), false);
  });

  it('rejects invalid entropy and a missing final dataDir before dispatch', async () => {
    const client = new FakeClient();
    for (const seedEntropy of [new Uint8Array(15), new Uint8Array(17)]) {
      await assert.rejects(
        client.startExternalSeedWallet(
          {
            network: 'regtest',
            dataDir: '/wallets',
            arkServerAddress: 'h:7070',
          },
          { seedEntropy },
        ),
        (err: WavelengthError) => err.code === 'invalid_external_seed',
      );
    }
    await assert.rejects(
      client.startExternalSeedWallet(
        { network: 'regtest', arkServerAddress: 'h:7070' },
        { seedEntropy: new Uint8Array(16) },
      ),
      (err: WavelengthError) => err.code === 'invalid_config',
    );
    assert.equal(
      client.calls.some((call) => call.method === 'startExternalSeedWallet'),
      false,
    );
  });

  it('createWallet sends the Go-shaped request with a base64 password', async () => {
    const client = new FakeClient();
    await client.createWallet({ password: 'pw' });
    const req = client.calls[0].params as { WalletPassword?: string };
    assert.equal(req.WalletPassword, Buffer.from('pw', 'utf8').toString('base64'));
  });

  it('sendPrepared folds the prepare-time paymentHash into the result', async () => {
    const client = new FakeClient();
    client.responses.set('sendPrepared', {});
    const result = await client.sendPrepared({
      sendIntentId: 'i1',
      paymentHash: 'ph',
    } as never);
    assert.equal(result.paymentHash, 'ph');
  });

  describe('explicit Ark channel calls', () => {
    const channelId = '01'.repeat(32);
    const amountSat = 4_294_967_297; // Must survive a 32-bit boundary.
    const idempotencyKey = ' promotion-1 ';
    const invoice = 'ln-channel-invoice';

    it('preserves the promotion amount and caller key across explicit retries', async () => {
      const client = new FakeClient();
      client.responses.set('promoteVTXO', {
        ChannelID: channelId, Phase: 'Active', CapacitySat: amountSat,
      });
      for (let i = 0; i < 2; i++) {
        assert.deepEqual(await client.promoteVTXO({ amountSat, idempotencyKey }), {
          channelId, phase: 'Active', capacitySat: amountSat,
        });
      }
      const call = {
        method: 'promoteVTXO',
        params: { AmountSat: amountSat, IdempotencyKey: idempotencyKey },
      };
      assert.deepEqual(client.calls, [call, call]);
    });

    it('dispatches the exact fee cap and returns the normalized payment proof', async () => {
      const client = new FakeClient();
      const paymentHash = 'ab'.repeat(32);
      const preimage = 'cd'.repeat(32);
      for (const feeSat of [0, 5]) {
        client.responses.set('payOnActiveChannel', {
          ChannelID: channelId, PaymentHash: paymentHash, Preimage: preimage,
          PrivateAmountSat: amountSat, FeeSat: feeSat,
        });
        assert.deepEqual(await client.payOnActiveChannel({ invoice, maxFeeSat: feeSat }), {
          channelId, paymentHash, preimage, privateAmountSat: amountSat, feeSat,
        });
      }
      assert.deepEqual(client.calls, [0, 5].map((maxFeeSat) => ({
        method: 'payOnActiveChannel', params: { Invoice: invoice, MaxFeeSat: maxFeeSat },
      })));
    });

    it('issues a channel invoice and normalizes its nested activity entry', async () => {
      const client = new FakeClient();
      client.responses.set('receiveOnActiveChannel', {
        Invoice: invoice, Entry: { ID: 'receive-1', Progress: null, Request: null },
      });
      const memo = 'inbound';
      assert.deepEqual(await client.receiveOnActiveChannel({ amountSat, memo }), {
        invoice, entry: { id: 'receive-1', progress: undefined, request: undefined },
      });
      assert.deepEqual(client.calls, [{
        method: 'receiveOnActiveChannel', params: { AmountSat: amountSat, Memo: memo },
      }]);
    });

    it('rejects non-JSON and inexact satoshis before dispatch', async () => {
      const client = new FakeClient();
      const invalid = { code: 'invalid_channel_request' };
      for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
        1n, 2n ** 63n, '123', null, undefined]) {
        // Untyped hosts can pass values that TS would have rejected.
        const sats = value as number;
        await assert.rejects(client.promoteVTXO({ amountSat: sats, idempotencyKey }), invalid);
        await assert.rejects(client.receiveOnActiveChannel({ amountSat: sats }), invalid);
        await assert.rejects(client.payOnActiveChannel({ invoice, maxFeeSat: sats }), invalid);
      }
      await assert.rejects(client.promoteVTXO({ amountSat: 0, idempotencyKey }), invalid);
      await assert.rejects(client.receiveOnActiveChannel({ amountSat: 0 }), invalid);
      assert.deepEqual(client.calls, []);
    });

    it('requires a wire-stable caller key and a nonempty invoice', async () => {
      const client = new FakeClient();
      const invalid = { code: 'invalid_channel_request' };
      // U+1F511 takes two JS code units but four UTF-8 bytes.
      const boundaryKey = '\u{1F511}'.repeat(32);
      for (const key of ['', undefined, 1, 'x'.repeat(129), boundaryKey + 'x', '\uD800']) {
        await assert.rejects(client.promoteVTXO({ amountSat, idempotencyKey: key as string }), invalid);
      }
      await assert.rejects(client.payOnActiveChannel({ invoice: '', maxFeeSat: 0 }), invalid);
      await assert.rejects(client.receiveOnActiveChannel({ amountSat, memo: 1n as never }), invalid);
      assert.deepEqual(client.calls, []);
      await client.promoteVTXO({ amountSat, idempotencyKey: boundaryKey });
      assert.deepEqual(client.calls, [{
        method: 'promoteVTXO', params: { AmountSat: amountSat, IdempotencyKey: boundaryKey },
      }]);
    });

    it('propagates daemon and older-runtime errors without retry or fallback', async () => {
      const client = new FakeClient();
      const operations = {
        promoteVTXO: () => client.promoteVTXO({ amountSat, idempotencyKey }),
        payOnActiveChannel: () => client.payOnActiveChannel({ invoice, maxFeeSat: 0 }),
        receiveOnActiveChannel: () => client.receiveOnActiveChannel({ amountSat }),
      };
      for (const [method, invoke] of Object.entries(operations)) {
        for (const error of [
          new Error('rpc error: code = FailedPrecondition desc = no liquidity'),
          new WavelengthError(`unsupported facade method: ${method}`, 'unsupported_facade_method'),
        ]) {
          client.responses.set(method, error);
          client.calls.length = 0;
          await assert.rejects(invoke, (err) => err === error);
          assert.deepEqual(client.calls.map((call) => call.method), [method]);
        }
      }
    });
  });

  it('forwards list kinds and both exit variants exactly', async () => {
    const client = new FakeClient();
    await client.list({ view: 'activity', kinds: ['send', 'exit'] });
    await client.exit({ outpoint: 'tx:0', destination: 'bcrt1q...' });
    await client.exit({ outpoint: 'tx:1', forceUnrollAck: FORCE_UNROLL_ACK });
    assert.deepEqual(client.calls.map((call) => call.params), [
      { view: 'activity', kinds: ['send', 'exit'] },
      { outpoint: 'tx:0', destination: 'bcrt1q...' },
      { outpoint: 'tx:1', forceUnrollAck: FORCE_UNROLL_ACK },
    ]);
  });

  it('rejects an unsafe activity cursor before opening the transport', async () => {
    const client = new FakeClient();
    await assert.rejects(
      () => client.startActivity({ cursor: -1 }),
      (err: WavelengthError) => err.code === 'invalid_cursor',
    );
    assert.equal(client.activityOpens.length, 0);
  });

  it('stop emits runtimeStopped to subscribers', async () => {
    const client = new FakeClient();
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));
    await client.stop();
    assert.deepEqual(events, [{ type: 'runtimeStopped' }]);
  });

  it('runs the afterDaemonStopped hook before announcing the stop', async () => {
    // A transport releases exclusive resources in this hook, so it has to run
    // once the daemon is confirmed down but before a subscriber can react to
    // the stop by starting the runtime again.
    const order: string[] = [];
    class HookedClient extends FakeClient {
      protected afterDaemonStopped(): void {
        order.push('hook');
      }
    }

    const client = new HookedClient();
    client.subscribe(() => order.push('runtimeStopped'));
    await client.stop();

    assert.deepEqual(order, ['hook', 'runtimeStopped']);
  });

  it('does not run afterDaemonStopped when the stop call fails', async () => {
    let hookRuns = 0;
    class FailingStopClient extends FakeClient {
      protected invokeFacade<T = unknown>(method: FacadeMethod): Promise<T> {
        if (method === 'stop') {
          return Promise.reject(new Error('daemon did not acknowledge stop'));
        }

        return Promise.resolve({} as T);
      }
      protected afterDaemonStopped(): void {
        hookRuns += 1;
      }
    }

    const client = new FailingStopClient();
    await assert.rejects(client.stop());
    assert.equal(hookRuns, 0, 'an unacknowledged stop is not a confirmed stop');
  });

  it('dispose clears subscribers', async () => {
    const client = new FakeClient();
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));
    client.dispose();
    await client.stop();
    assert.equal(events.length, 0);
  });
});

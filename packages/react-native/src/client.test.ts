import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NativeWavelengthClient,
  type NativeActivityEvent,
  type WavelengthNativeModule,
} from './client.ts';
import type { WavelengthEvent } from '@lightninglabs/wavelength-core';

const FINAL_PROFILE_DATA_DIR = '/data/wavelength/wdk/regtest/account-7';

// A scriptable fake of the native module: records calls, replays canned JSON,
// and hands the test the event listener so it can inject activity events.
function makeFake() {
  const calls: Array<{ method: string; paramsJson: string }> = [];
  const responses = new Map<string, string>();
  const startActivityRequests: string[] = [];
  let startActivityCount = 0;
  let stopActivityCount = 0;
  let stopActivityRejects = false;
  let defaultDataDirCount = 0;
  let deferredStop: { promise: Promise<void>; resolve: () => void } | null = null;
  let listener: ((event: NativeActivityEvent) => void) | null = null;
  let unsubscribed = 0;

  const native: WavelengthNativeModule = {
    call(method, paramsJson) {
      calls.push({ method, paramsJson });
      const canned = responses.get(method);
      if (canned === 'REJECT') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(canned ?? '');
    },
    startActivity(reqJson) {
      startActivityCount += 1;
      startActivityRequests.push(reqJson);
      return Promise.resolve();
    },
    stopActivity() {
      stopActivityCount += 1;
      if (deferredStop) {
        return deferredStop.promise;
      }
      return stopActivityRejects
        ? Promise.reject(new Error('close failed'))
        : Promise.resolve();
    },
    getDefaultDataDir() {
      defaultDataDirCount += 1;
      return Promise.resolve('/data/wavelength');
    },
  };

  const subscribe = (l: (event: NativeActivityEvent) => void) => {
    listener = l;
    return () => {
      unsubscribed += 1;
      listener = null;
    };
  };

  return {
    native,
    subscribe,
    calls,
    responses,
    startActivityRequests,
    failStopActivity: () => {
      stopActivityRejects = true;
    },
    deferStopActivity: () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      deferredStop = { promise, resolve };
      return () => deferredStop!.resolve();
    },
    emit: (e: NativeActivityEvent) => listener?.(e),
    counts: () => ({
      startActivityCount,
      stopActivityCount,
      defaultDataDirCount,
      unsubscribed,
    }),
  };
}

describe('NativeWavelengthClient', () => {
  it('callFacade parses a native scalar JSON response', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('isRunning', 'true');

    assert.equal(await client.callFacade('isRunning'), true);
    assert.equal(fake.calls[0].method, 'isRunning');
  });

  it('normalizes a native JSON facade response in core', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('list', JSON.stringify({
      View: 'activity',
      Activity: { Entries: null },
      VTXOs: null,
      Onchain: null,
    }));

    assert.deepEqual(await client.callFacade('list'), {
      view: 'activity',
      activity: { entries: [] },
      vtxos: undefined,
      onchain: undefined,
    });
  });

  it('start injects the platform data dir and dials grpc', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', '{"WalletState":0}');

    await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });

    const cfg = JSON.parse(fake.calls[0].paramsJson) as Record<string, unknown>;
    assert.equal(cfg.data_dir, '/data/wavelength');
    assert.equal(cfg.server_transport, 'grpc');
    assert.equal(cfg.server_address, 'h:7070');
    assert.equal(fake.calls[1].method, 'getInfo');
  });

  it('start keeps an explicit dataDir', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', '{}');

    await client.start({ network: 'regtest', dataDir: '/custom' });

    const cfg = JSON.parse(fake.calls[0].paramsJson) as Record<string, unknown>;
    assert.equal(cfg.data_dir, '/custom');
  });

  it('startExternalSeedWallet preserves the final profile config', async () => {
    const fake = makeFake();
    fake.native.supportsArkChannels = () => Promise.resolve(true);
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('startExternalSeedWallet', JSON.stringify({
      Imported: true,
      IdentityPubKey: 'identity',
      RecoveryRan: true,
      RecoveredBoardingAddresses: 1,
      RecoveredBoardingUTXOs: 2,
      RecoveredVTXOs: 3,
      RecoveredOORReceiveScripts: 4,
      RecoveredOORRecipientEvents: 5,
    }));

    const result = await client.startExternalSeedWallet(
      {
        network: 'regtest',
        dataDir: FINAL_PROFILE_DATA_DIR,
        arkServerAddress: 'h:7070',
        arkChannelsEnabled: true,
      },
      {
        seedEntropy: Uint8Array.from({ length: 16 }, (_, index) => index),
        expectedIdentityPubKey: 'identity',
        recoverState: true,
        recoveryWindow: 37,
      },
    );

    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].method, 'startExternalSeedWallet');
    assert.deepEqual(JSON.parse(fake.calls[0].paramsJson), {
      config: {
        data_dir: FINAL_PROFILE_DATA_DIR,
        network: 'regtest',
        server_address: 'h:7070',
        ark_channels_enabled: true,
        server_transport: 'grpc',
        swap_server_transport: 'grpc',
        wallet_type: 'lwwallet',
      },
      seed_entropy: 'AAECAwQFBgcICQoLDA0ODw==',
      expected_identity_pubkey: 'identity',
      recover_state: true,
      recovery_window: 37,
    });
    assert.equal(fake.counts().defaultDataDirCount, 0);
    assert.deepEqual(result, {
      imported: true,
      identityPubKey: 'identity',
      recoveryRan: true,
      recoveredBoardingAddresses: 1,
      recoveredBoardingUTXOs: 2,
      recoveredVTXOs: 3,
      recoveredOORReceiveScripts: 4,
      recoveredOORRecipientEvents: 5,
    });
  });

  it('forwards channel opt-in, exact verbs and JSON without a fallback', async () => {
    const fake = makeFake();
    fake.native.supportsArkChannels = () => Promise.resolve(true);
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const channelId = 'ab'.repeat(32);
    const preimage = '00'.repeat(32);
    const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
    fake.responses.set('getInfo', '{}');
    fake.responses.set('promoteVTXO', JSON.stringify({
      ChannelID: channelId, Phase: 'Active', CapacitySat: 500,
    }));
    fake.responses.set('payOnActiveChannel', JSON.stringify({
      ChannelID: channelId, Preimage: preimage, PaymentHash: paymentHash,
      PrivateAmountSat: 200, FeeSat: 0,
    }));
    fake.responses.set('receiveOnActiveChannel', JSON.stringify({
      Invoice: 'ln-in', Entry: { Progress: null, Request: null },
    }));

    await client.start({ network: 'regtest', arkChannelsEnabled: true });
    assert.equal(JSON.parse(fake.calls[0].paramsJson).ark_channels_enabled, true);
    assert.deepEqual(await client.promoteVTXO({ amountSat: 500, idempotencyKey: 'p1' }), {
      channelId, phase: 'Active', capacitySat: 500,
    });
    assert.deepEqual(await client.payOnActiveChannel({ invoice: 'ln-out', maxFeeSat: 0 }), {
      channelId, preimage, paymentHash, privateAmountSat: 200, feeSat: 0,
    });
    assert.deepEqual(await client.receiveOnActiveChannel({ amountSat: 70, memo: 'inbound' }), {
      invoice: 'ln-in', entry: { progress: undefined, request: undefined },
    });
    assert.deepEqual(fake.calls.slice(2).map(({ method, paramsJson }) =>
      [method, JSON.parse(paramsJson)]), [
      ['promoteVTXO', { AmountSat: 500, IdempotencyKey: 'p1' }],
      ['payOnActiveChannel', { Invoice: 'ln-out', MaxFeeSat: 0 }],
      ['receiveOnActiveChannel', { AmountSat: 70, Memo: 'inbound' }],
    ]);
  });

  for (const binary of ['old RN bridge', 'old gomobile bindings']) {
    it(`rejects channel operations before dispatch on ${binary}`, async () => {
      const fake = makeFake();
      if (binary === 'old gomobile bindings') {
        fake.native.supportsArkChannels = () => Promise.resolve(false);
      }
      const client = new NativeWavelengthClient(fake.native, fake.subscribe);
      const config = {
        network: 'regtest' as const, dataDir: FINAL_PROFILE_DATA_DIR, arkChannelsEnabled: true,
      };
      const unsupported = { name: 'WavelengthError', code: 'unsupported_facade_method' };
      await assert.rejects(client.start(config), unsupported);
      await assert.rejects(client.startExternalSeedWallet(config, {
        seedEntropy: new Uint8Array(16),
      }), unsupported);
      await assert.rejects(client.promoteVTXO({ amountSat: 20, idempotencyKey: 'p' }), unsupported);
      await assert.rejects(client.payOnActiveChannel({ invoice: 'inv', maxFeeSat: 1 }), unsupported);
      await assert.rejects(client.receiveOnActiveChannel({ amountSat: 1 }), unsupported);
      assert.deepEqual(fake.calls, []);
      fake.responses.set('getInfo', '{}');
      await client.start({ ...config, arkChannelsEnabled: false });
      assert.deepEqual(fake.calls.map(({ method }) => method), ['start', 'getInfo']);
    });
  }

  it('preserves channel errors, including native causes, without retrying the payment', async () => {
    for (const [code, message] of [
      ['wavelength_error', 'rpc error: no liquidity'],
      ['unsupported_facade_method', 'Native bindings do not support Ark channels'],
    ]) {
      const fake = makeFake();
      const cause = Object.assign(new Error(message), { code });
      const methods: string[] = [];
      fake.native.supportsArkChannels = () => Promise.resolve(true);
      fake.native.call = async (method) => { methods.push(method); throw cause; };
      const client = new NativeWavelengthClient(fake.native, fake.subscribe);
      await assert.rejects(client.payOnActiveChannel({ invoice: 'inv', maxFeeSat: 1 }),
        { name: 'WavelengthError', code, message, cause });
      assert.deepEqual(methods, ['payOnActiveChannel']);
    }
  });

  it('wraps native rejections in WavelengthError', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', 'REJECT');

    await assert.rejects(client.getInfo(), (err: Error) => {
      assert.equal(err.name, 'WavelengthError');
      assert.equal(err.message, 'boom');
      return true;
    });
  });

  it('startActivity opens once and re-emits entries camelized', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity({
      includeExisting: true,
      kinds: ['send', 'exit'],
      cursor: 99,
    });
    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 1);
    assert.deepEqual(JSON.parse(fake.startActivityRequests[0]), {
      includeExisting: true,
      kinds: ['send', 'exit'],
      cursor: 99,
    });

    fake.emit({
      kind: 'entry',
      payload: '{"Kind":"send","Progress":null,"Request":null}',
    });
    assert.deepEqual(events, [
      {
        type: 'activity',
        payload: { kind: 'send', progress: undefined, request: undefined },
      },
    ]);
  });

  it('emits activityStream failed on a native error and allows reopening', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.emit({ kind: 'error', payload: 'stream broke' });

    assert.deepEqual(events, [
      {
        type: 'activityStream',
        payload: { state: 'failed', message: 'stream broke' },
      },
    ]);

    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 2);
  });

  it('emits activityStream ended on an unexpected native end and allows reopening', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.emit({ kind: 'end', payload: '' });

    assert.deepEqual(events, [
      { type: 'activityStream', payload: { state: 'ended' } },
    ]);

    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 2);
  });

  it('serializes a stop-then-start so the subscribe waits for the close', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);

    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 1);

    const resolveStop = fake.deferStopActivity();
    client.stopActivity();
    const secondStart = client.startActivity();
    // Let the chain advance as far as it can while the stop is still pending.
    await Promise.resolve();
    await Promise.resolve();
    // The second subscribe must not have fired while the close is in flight.
    assert.equal(fake.counts().startActivityCount, 1);

    resolveStop();
    await secondStart;
    // Once the close resolved, the serialized start subscribed.
    assert.equal(fake.counts().startActivityCount, 2);
  });

  it('drops an unparseable activity entry with a contextual log', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.emit({ kind: 'entry', payload: '{not json' });

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'log');
    const payload = events[0].payload as { level: string; message: string };
    assert.equal(payload.level, 'error');
    assert.match(payload.message, /dropped an unparseable activity entry/);
  });

  it('logs a warning when the native close fails', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.failStopActivity();
    client.stopActivity();
    // The rejection is handled asynchronously; let the microtask run.
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(events.length, 1);
    const payload = events[0].payload as { level: string; message: string };
    assert.equal(payload.level, 'warn');
    assert.match(payload.message, /failed to close the activity stream/);
  });

  it('stopActivity and dispose release native resources', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    await client.startActivity();

    client.stopActivity();
    // The stop runs on the serialized op chain; let it settle before asserting.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fake.counts().stopActivityCount, 1);

    client.dispose();
    assert.equal(fake.counts().unsubscribed, 1);
  });

  it('closes the native stream when disposed with an open subscription', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    client.dispose();
    // dispose enqueues the native close on the op chain; let it settle.
    await Promise.resolve();
    await Promise.resolve();

    // The subscription must actually be closed, not leaked.
    assert.equal(fake.counts().stopActivityCount, 1);
    // A terminal end after a client-initiated dispose stays silent.
    fake.emit({ kind: 'end', payload: '' });
    assert.deepEqual(
      events.filter((e) => e.type === 'activityStream'),
      [],
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NativeWalletDKClient,
  type NativeActivityEvent,
  type WalletdkNativeModule,
} from './client.ts';
import type { WalletDKEvent } from '@lightninglabs/walletdk-core';

// A scriptable fake of the native module: records calls, replays canned JSON,
// and hands the test the event listener so it can inject activity events.
function makeFake() {
  const calls: Array<{ method: string; paramsJson: string }> = [];
  const responses = new Map<string, string>();
  let startActivityCount = 0;
  let stopActivityCount = 0;
  let listener: ((event: NativeActivityEvent) => void) | null = null;
  let unsubscribed = 0;

  const native: WalletdkNativeModule = {
    call(method, paramsJson) {
      calls.push({ method, paramsJson });
      const canned = responses.get(method);
      if (canned === 'REJECT') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(canned ?? '');
    },
    startActivity() {
      startActivityCount += 1;
      return Promise.resolve();
    },
    stopActivity() {
      stopActivityCount += 1;
      return Promise.resolve();
    },
    getDefaultDataDir() {
      return Promise.resolve('/data/walletdk');
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
    emit: (e: NativeActivityEvent) => listener?.(e),
    counts: () => ({ startActivityCount, stopActivityCount, unsubscribed }),
  };
}

describe('NativeWalletDKClient', () => {
  it('callRaw parses and camelizes the native JSON response', async () => {
    const fake = makeFake();
    const client = new NativeWalletDKClient(fake.native, fake.subscribe);
    fake.responses.set('balance', '{"ConfirmedSat":21}');

    const balance = await client.balance();
    assert.equal(balance.confirmedSat, 21);
    assert.equal(fake.calls[0].method, 'balance');
  });

  it('start injects the platform data dir and dials grpc', async () => {
    const fake = makeFake();
    const client = new NativeWalletDKClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', '{"WalletState":0}');

    await client.start({ network: 'regtest', arkServerUrl: 'h:7070' });

    const cfg = JSON.parse(fake.calls[0].paramsJson) as Record<string, unknown>;
    assert.equal(cfg.data_dir, '/data/walletdk');
    assert.equal(cfg.server_transport, 'grpc');
    assert.equal(fake.calls[1].method, 'getInfo');
  });

  it('start keeps an explicit dataDir', async () => {
    const fake = makeFake();
    const client = new NativeWalletDKClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', '{}');

    await client.start({ network: 'regtest', dataDir: '/custom' });

    const cfg = JSON.parse(fake.calls[0].paramsJson) as Record<string, unknown>;
    assert.equal(cfg.data_dir, '/custom');
  });

  it('wraps native rejections in WalletDKError', async () => {
    const fake = makeFake();
    const client = new NativeWalletDKClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', 'REJECT');

    await assert.rejects(client.getInfo(), (err: Error) => {
      assert.equal(err.name, 'WalletDKError');
      assert.equal(err.message, 'boom');
      return true;
    });
  });

  it('startActivity opens once and re-emits entries camelized', async () => {
    const fake = makeFake();
    const client = new NativeWalletDKClient(fake.native, fake.subscribe);
    const events: WalletDKEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity({ includeExisting: true });
    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 1);

    fake.emit({ kind: 'entry', payload: '{"Kind":"send"}' });
    assert.deepEqual(events, [
      { type: 'activity', payload: { kind: 'send' } },
    ]);
  });

  it('surfaces a stream error as a log event and allows reopening', async () => {
    const fake = makeFake();
    const client = new NativeWalletDKClient(fake.native, fake.subscribe);
    const events: WalletDKEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.emit({ kind: 'error', payload: 'stream broke' });

    assert.deepEqual(events, [
      { type: 'log', payload: { level: 'error', message: 'stream broke' } },
    ]);

    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 2);
  });

  it('stopActivity and dispose release native resources', async () => {
    const fake = makeFake();
    const client = new NativeWalletDKClient(fake.native, fake.subscribe);
    await client.startActivity();

    client.stopActivity();
    assert.equal(fake.counts().stopActivityCount, 1);

    client.dispose();
    assert.equal(fake.counts().unsubscribed, 1);
  });
});

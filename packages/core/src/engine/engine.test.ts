import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { WalletInfo } from '../state.ts';
import { FakeWalletDKClient } from '../testing/fake-client.ts';
import { createWalletEngine } from './engine.ts';

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

const readyInfo = { walletState: 'ready', walletReady: true } as WalletInfo;
const noneInfo = { walletState: 'none', walletReady: false } as WalletInfo;

describe('engine lifecycle', () => {
  it('starts at loading and advances to runtimeReady when the client is ready', async () => {
    const client = new FakeWalletDKClient();
    const engine = createWalletEngine({ client });
    assert.equal(engine.getSnapshot().phase, 'loading');
    client.resolveReady();
    await flush();
    assert.equal(engine.getSnapshot().phase, 'runtimeReady');
    engine.dispose();
  });

  it('surfaces a rejected ready() as the error phase with an Error', async () => {
    const client = new FakeWalletDKClient();
    const engine = createWalletEngine({ client });
    client.rejectReady(new Error('wasm failed'));
    await flush();
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'error');
    assert.equal(snap.error?.message, 'wasm failed');
    engine.dispose();
  });

  it('start() adopts info, derives the phase, and refreshes', async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    const info = await engine.start({ network: 'signet' } as never);
    assert.equal(info.walletReady, true);
    await flush();
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'ready');
    assert.notEqual(snap.balance, null);
    engine.dispose();
  });

  it('a failed start() reaches the error phase (no stranded starting)', async () => {
    const client = new FakeWalletDKClient();
    client.fail('start', new Error('bad config'));
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await assert.rejects(() => engine.start({} as never), /bad config/);
    assert.equal(engine.getSnapshot().phase, 'error');
    assert.equal(engine.getSnapshot().error?.message, 'bad config');
    engine.dispose();
  });

  it('autoStart starts once the runtime is ready', async () => {
    const client = new FakeWalletDKClient();
    client.info = noneInfo;
    const engine = createWalletEngine({
      client,
      config: { network: 'signet' } as never,
      autoStart: true,
    });
    client.resolveReady();
    await flush();
    assert.equal(client.countOf('start'), 1);
    assert.equal(engine.getSnapshot().phase, 'needsWallet');
    engine.dispose();
  });

  it('start() without any config throws a helpful error', async () => {
    const client = new FakeWalletDKClient();
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await assert.rejects(() => engine.start(), /config/);
    engine.dispose();
  });

  it('a failed stop() reaches the error phase (no stranded stopping)', async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.fail('stop', new Error('stuck'));
    await assert.rejects(() => engine.stop(), /stuck/);
    assert.equal(engine.getSnapshot().phase, 'error');
    engine.dispose();
  });

  it('stop() clears wallet data and lands on stopped', async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    await engine.stop();
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'stopped');
    assert.equal(snap.info, null);
    assert.equal(snap.balance, null);
    assert.deepEqual(snap.activity, []);
    engine.dispose();
  });

  it('a runtimeStopped event (worker crash) clears data from any phase', async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.emit({ type: 'runtimeStopped' } as never);
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'stopped');
    assert.equal(snap.info, null);
    engine.dispose();
  });

  it('buffers log events bounded to MAX_LOGS and clearLogs empties them', async () => {
    const client = new FakeWalletDKClient();
    const engine = createWalletEngine({ client });
    for (let i = 0; i < 205; i++) {
      client.emit({ type: 'log', payload: { message: `m${i}` } } as never);
    }
    assert.equal(engine.getSnapshot().logs.length, 200);
    assert.equal(engine.getSnapshot().logs[0].message, 'm5');
    engine.clearLogs();
    assert.deepEqual(engine.getSnapshot().logs, []);
    engine.dispose();
  });

  it('refresh keeps unchanged slices referentially stable', async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    const before = engine.getSnapshot();
    await engine.refresh();
    const after = engine.getSnapshot();
    assert.equal(after.info, before.info);
    assert.equal(after.balance, before.balance);
    assert.equal(after.activity, before.activity);
    engine.dispose();
  });

  it('dispose unsubscribes from the client', async () => {
    const client = new FakeWalletDKClient();
    const engine = createWalletEngine({ client });
    assert.equal(client.listenerCount(), 1);
    engine.dispose();
    assert.equal(client.listenerCount(), 0);
  });
});

describe('engine wallet verbs', () => {
  async function readyEngine() {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    return { client, engine };
  }

  it('createWallet refetches real info instead of fabricating a partial', async () => {
    const client = new FakeWalletDKClient();
    client.info = noneInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    assert.equal(engine.getSnapshot().phase, 'needsWallet');
    client.info = { ...readyInfo, identityPubKey: 'pk-real' } as WalletInfo;
    const result = await engine.createWallet({ password: 'pw' });
    assert.equal(result.identityPubKey, 'pk-create');
    await flush();
    assert.equal(engine.getSnapshot().phase, 'ready');
    assert.equal(engine.getSnapshot().info?.identityPubKey, 'pk-real');
    engine.dispose();
  });

  it('a failed createWallet leaves the phase unchanged and rejects', async () => {
    const client = new FakeWalletDKClient();
    client.info = noneInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.fail('createWallet', new Error('weak password'));
    await assert.rejects(() => engine.createWallet({ password: 'x' }), /weak password/);
    assert.equal(engine.getSnapshot().phase, 'needsWallet');
    engine.dispose();
  });

  it('send resolves on the daemon ack without awaiting the refresh', async () => {
    const { client, engine } = await readyEngine();
    // A hanging refresh must not delay the send resolution.
    let releaseBalance!: () => void;
    client.impl('balance', () => new Promise<void>((res) => { releaseBalance = res as never; }));
    const result = await engine.send({ destination: 'lnbc1...' } as never);
    assert.ok(result);
    // The background refresh was kicked (balance call is in flight).
    assert.ok(client.countOf('balance') >= 1);
    releaseBalance();
    engine.dispose();
  });

  it('a refresh failure never reports a settled send as failed', async () => {
    const { client, engine } = await readyEngine();
    client.fail('getInfo', new Error('read blip'));
    await assert.doesNotReject(() => engine.send({} as never));
    engine.dispose();
  });

  it('prepareSend quotes without kicking any refresh', async () => {
    const { client, engine } = await readyEngine();
    const balancesBefore = client.countOf('balance');
    await engine.prepareSend({} as never);
    await flush();
    assert.equal(client.countOf('balance'), balancesBefore);
    engine.dispose();
  });

  it('sendPrepared dispatches and kicks a background refresh', async () => {
    const { client, engine } = await readyEngine();
    const balancesBefore = client.countOf('balance');
    await engine.sendPrepared({ sendIntentId: 'intent-1' } as never);
    await flush();
    assert.ok(client.countOf('balance') > balancesBefore);
    engine.dispose();
  });

  it('unlockWallet adopts refetched info and reaches ready', async () => {
    const client = new FakeWalletDKClient();
    client.info = { walletState: 'locked', walletReady: false } as WalletInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    assert.equal(engine.getSnapshot().phase, 'locked');
    client.info = readyInfo;
    await engine.unlockWallet({ password: 'pw' });
    await flush();
    assert.equal(engine.getSnapshot().phase, 'ready');
    engine.dispose();
  });
});

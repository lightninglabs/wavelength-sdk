import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FORCE_UNROLL_ACK } from '../requests.ts';
import type { Entry, ListResult } from '../results.ts';
import type { WalletInfo } from '../state.ts';
import type { WavelengthPerformanceEvent } from '../performance.ts';
import { FakeWavelengthClient } from '../testing/fake-client.ts';
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
    const client = new FakeWavelengthClient();
    const engine = createWalletEngine({ client });
    assert.equal(engine.getSnapshot().phase, 'loading');
    client.resolveReady();
    await flush();
    assert.equal(engine.getSnapshot().phase, 'runtimeReady');
    engine.dispose();
  });

  it('surfaces a rejected ready() as the error phase with an Error', async () => {
    const client = new FakeWavelengthClient();
    const engine = createWalletEngine({ client });
    client.rejectReady(new Error('wasm failed'));
    await flush();
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'error');
    assert.equal(snap.error?.message, 'wasm failed');
    engine.dispose();
  });

  it('start() adopts info, derives the phase, and refreshes', async () => {
    const client = new FakeWavelengthClient();
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
    const client = new FakeWavelengthClient();
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
    const client = new FakeWavelengthClient();
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
    const client = new FakeWavelengthClient();
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await assert.rejects(() => engine.start(), /config/);
    engine.dispose();
  });

  it('a failed stop() reaches the error phase (no stranded stopping)', async () => {
    const client = new FakeWavelengthClient();
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
    const client = new FakeWavelengthClient();
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

  it('a refresh resolving after stop does not repopulate the snapshot', async () => {
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    // Block the background refresh's balance() call so it is still in flight
    // when stop() completes below.
    let releaseBalance!: () => void;
    client.impl('balance', () => new Promise<void>((res) => { releaseBalance = res as never; }));
    void engine.send({} as never);
    await flush();
    await engine.stop();
    assert.equal(engine.getSnapshot().phase, 'stopped');
    // Now let the stale refresh resolve. It must not repopulate the snapshot
    // stopCompleted just cleared.
    releaseBalance();
    await flush();
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'stopped');
    assert.equal(snap.info, null);
    assert.equal(snap.balance, null);
    assert.deepEqual(snap.activity, []);
    engine.dispose();
  });

  it('a runtimeStopped event (worker crash) clears data from any phase', async () => {
    const client = new FakeWavelengthClient();
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
    const client = new FakeWavelengthClient();
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
    const client = new FakeWavelengthClient();
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

  it('start() rejects while stopping, without calling client.start', async () => {
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.impl('stop', () => new Promise(() => undefined));
    void engine.stop().catch(() => undefined);
    await flush();
    assert.equal(engine.getSnapshot().phase, 'stopping');
    const startsBefore = client.countOf('start');
    await assert.rejects(() => engine.start({} as never), /stopping/);
    assert.equal(client.countOf('start'), startsBefore);
    engine.dispose();
  });

  it('dispose unsubscribes from the client', async () => {
    const client = new FakeWavelengthClient();
    const engine = createWalletEngine({ client });
    assert.equal(client.listenerCount(), 1);
    engine.dispose();
    assert.equal(client.listenerCount(), 0);
  });
});

describe('engine wallet verbs', () => {
  async function readyEngine() {
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    return { client, engine };
  }

  it('createWallet refetches real info instead of fabricating a partial', async () => {
    const client = new FakeWavelengthClient();
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

  it('reports create RPC, adoption, and total timing when opted in', async () => {
    const samples: WavelengthPerformanceEvent[] = [];
    const client = new FakeWavelengthClient();
    client.info = noneInfo;
    const engine = createWalletEngine({
      client,
      onPerformance: (sample) => samples.push(sample),
    });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.info = readyInfo;

    await engine.createWallet({ password: 'pw' });

    assert.deepEqual(
      samples
        .filter((sample) => sample.stage === 'wallet')
        .map((sample) => sample.phase),
      ['createRpc', 'adoptInfo', 'createTotal'],
    );
    const adoption = samples.find((sample) => sample.phase === 'adoptInfo');
    assert.deepEqual(adoption?.detail, {
      operation: 'create',
      attempts: 1,
      retryWaitMs: 0,
      outcome: 'success',
    });
    engine.dispose();
  });

  it('does not let a throwing performance reporter break wallet work', async () => {
    const client = new FakeWavelengthClient();
    client.info = noneInfo;
    const engine = createWalletEngine({
      client,
      onPerformance: () => {
        throw new Error('diagnostics failed');
      },
    });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.info = readyInfo;

    await assert.doesNotReject(() =>
      engine.createWallet({ password: 'pw' }),
    );
    engine.dispose();
  });

  it('a failed createWallet leaves the phase unchanged and rejects', async () => {
    const client = new FakeWavelengthClient();
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
    const client = new FakeWavelengthClient();
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

  it('#adoptInfo retries a transient getInfo failure and still reaches ready', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const samples: WavelengthPerformanceEvent[] = [];
    const client = new FakeWavelengthClient();
    client.info = noneInfo;
    const engine = createWalletEngine({
      client,
      onPerformance: (sample) => samples.push(sample),
    });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    let calls = 0;
    client.impl('getInfo', () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('transient');
      }

      return readyInfo;
    });
    const promise = engine.createWallet({ password: 'pw' });
    await flush();
    mock.timers.tick(1000);
    await flush();
    mock.timers.tick(1000);
    await flush();
    await promise;
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'ready');
    assert.equal(snap.error, null);
    const adoption = samples.find((sample) =>
      sample.phase === 'adoptInfo' &&
      sample.detail?.operation === 'create'
    );
    assert.deepEqual(adoption?.detail, {
      operation: 'create',
      attempts: 3,
      retryWaitMs: 2000,
      outcome: 'success',
    });
    engine.dispose();
    mock.timers.reset();
  });

  it('#adoptInfo exhaustion escalates to error after createWallet itself succeeded', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = noneInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.fail('getInfo', new Error('daemon gone'));
    const promise = engine.createWallet({ password: 'pw' });
    await flush();
    mock.timers.tick(1000);
    await flush();
    mock.timers.tick(1000);
    await flush();
    await promise;
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'error');
    assert.match(snap.error?.message ?? '', /stopped responding/);
    engine.dispose();
    mock.timers.reset();
  });

  it('openWalletFromPasskey adopts refetched info and reaches ready', async () => {
    const client = new FakeWavelengthClient();
    client.info = { walletState: 'locked', walletReady: false } as WalletInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    assert.equal(engine.getSnapshot().phase, 'locked');
    client.info = readyInfo;
    await engine.openWalletFromPasskey({ prfOutput: 'deadbeef' });
    await flush();
    assert.equal(engine.getSnapshot().phase, 'ready');
    engine.dispose();
  });
});

describe('engine restore', () => {
  async function needsWalletEngine() {
    const client = new FakeWavelengthClient();
    client.info = noneInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    return { client, engine };
  }
  const restoreReq = {
    password: 'pw',
    mnemonic: ['a', 'b'],
    recoverState: true,
  };

  it('resolves at usability via the readiness poll, before the scan finishes', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    // The scan (createWallet) hangs; the wallet reports ready underneath.
    client.impl('createWallet', () => new Promise(() => undefined));
    const promise = engine.restoreWallet(restoreReq);
    assert.equal(engine.getSnapshot().phase, 'restoring');
    assert.equal(engine.getSnapshot().recovery.status, 'restoring');
    // Let the immediate poller tick (which reads the still-not-ready info)
    // settle before advancing the clock, matching poller.test.ts's own
    // start(); await flush(); pattern: otherwise it is still in flight when
    // the mock interval fires and that tick is dropped as a no-op overlap.
    await flush();
    client.info = readyInfo;
    mock.timers.tick(1500);
    await flush();
    const info = await promise;
    assert.equal(info.walletReady, true);
    assert.equal(engine.getSnapshot().phase, 'ready');
    // The scan is still running, so recovery stays restoring.
    assert.equal(engine.getSnapshot().recovery.status, 'restoring');
    engine.dispose();
    mock.timers.reset();
  });

  it('transient locked info during restore does not leak (no unlock flash)', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    client.impl('createWallet', () => new Promise(() => undefined));
    void engine.restoreWallet(restoreReq).catch(() => undefined);
    // Let the immediate poller tick settle before advancing the clock (see
    // the previous test), so the interval tick below actually runs and
    // observes the transient locked info instead of being dropped as an
    // overlapping no-op.
    await flush();
    client.info = { walletState: 'locked', walletReady: false } as WalletInfo;
    mock.timers.tick(1500);
    await flush();
    assert.equal(engine.getSnapshot().phase, 'restoring');
    engine.dispose();
    mock.timers.reset();
  });

  it('scan completion marks recovery done and refreshes', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    client.info = readyInfo;
    const promise = engine.restoreWallet(restoreReq);
    await flush();
    await promise;
    assert.equal(engine.getSnapshot().phase, 'ready');
    assert.equal(engine.getSnapshot().recovery.status, 'done');
    engine.dispose();
    mock.timers.reset();
  });

  it('an untracked restore never touches the recovery banner state', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    client.info = readyInfo;
    await engine.restoreWallet({ ...restoreReq, recoverState: false });
    assert.equal(engine.getSnapshot().recovery.status, 'idle');
    engine.dispose();
    mock.timers.reset();
  });

  it('a failure after the wallet came up keeps it usable with a failed banner', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    client.fail('createWallet', new Error('scan died'));
    client.info = readyInfo;
    const info = await engine.restoreWallet(restoreReq);
    // The outer promise can settle via the immediate readiness poll (it
    // already sees the ready info) before the createWallet rejection
    // handler's own getInfo probe finishes and dispatches the failed
    // recovery status; give that independent chain a chance to land.
    await flush();
    assert.ok(info);
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'ready');
    assert.equal(snap.recovery.status, 'failed');
    assert.equal(
      snap.recovery.status === 'failed' ? snap.recovery.error.message : '',
      'scan died',
    );
    assert.equal(
      snap.recovery.status === 'failed' ? snap.recovery.walletUsable : undefined,
      true,
    );
    engine.dispose();
    mock.timers.reset();
  });

  it('a failure with the wallet down falls back to needsWallet and rejects', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    client.fail('createWallet', new Error('create failed'));
    client.info = noneInfo;
    await assert.rejects(() => engine.restoreWallet(restoreReq), /create failed/);
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'needsWallet');
    // The snapshot records the failure (not idle) so it survives a component
    // unmount that discards hook-local error state along with the screen.
    assert.equal(snap.recovery.status, 'failed');
    assert.equal(
      snap.recovery.status === 'failed' ? snap.recovery.error.message : '',
      'create failed',
    );
    assert.equal(
      snap.recovery.status === 'failed' ? snap.recovery.walletUsable : undefined,
      false,
    );
    engine.dispose();
    mock.timers.reset();
  });

  it('acknowledgeRecovery resets a terminal recovery state to idle', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    client.info = readyInfo;
    await engine.restoreWallet(restoreReq);
    assert.equal(engine.getSnapshot().recovery.status, 'done');
    engine.acknowledgeRecovery();
    assert.equal(engine.getSnapshot().recovery.status, 'idle');
    engine.dispose();
    mock.timers.reset();
  });

  it('acknowledgeRecovery is a no-op while a scan is restoring', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    client.impl('createWallet', () => new Promise(() => undefined));
    void engine.restoreWallet(restoreReq).catch(() => undefined);
    await flush();
    assert.equal(engine.getSnapshot().recovery.status, 'restoring');
    engine.acknowledgeRecovery();
    assert.equal(engine.getSnapshot().recovery.status, 'restoring');
    engine.dispose();
    mock.timers.reset();
  });

  it('a stop() completing mid-restore rejects the pending restore', async () => {
    const { client, engine } = await needsWalletEngine();
    client.impl('createWallet', () => new Promise(() => undefined));
    const restore = engine.restoreWallet(restoreReq);
    await flush();
    assert.equal(engine.getSnapshot().phase, 'restoring');
    await engine.stop();
    await assert.rejects(() => restore, /stopped during the restore/);
    engine.dispose();
  });

  it('a runtimeStopped event completing mid-restore rejects the pending restore', async () => {
    const { client, engine } = await needsWalletEngine();
    client.impl('createWallet', () => new Promise(() => undefined));
    const restore = engine.restoreWallet(restoreReq);
    await flush();
    assert.equal(engine.getSnapshot().phase, 'restoring');
    client.emit({ type: 'runtimeStopped' } as never);
    await assert.rejects(() => restore, /stopped during the restore/);
    engine.dispose();
  });

  it('a resolving createWallet after dispose does not adopt info or start the activity stream', async () => {
    const { client, engine } = await needsWalletEngine();
    let resolveCreate!: (result: unknown) => void;
    client.impl('createWallet', () => new Promise((res) => { resolveCreate = res as never; }));
    const promise = engine.restoreWallet(restoreReq);
    await flush();
    const startActivityBefore = client.countOf('startActivity');
    engine.dispose();
    await assert.rejects(() => promise, /disposed/);
    const phaseAfterDispose = engine.getSnapshot().phase;
    resolveCreate({ identityPubKey: 'pk-create' });
    await flush();
    assert.equal(client.countOf('startActivity'), startActivityBefore);
    assert.equal(engine.getSnapshot().phase, phaseAfterDispose);
  });

  it('a rejecting createWallet after dispose does not dispatch or probe getInfo again', async () => {
    const { client, engine } = await needsWalletEngine();
    let rejectCreate!: (err: unknown) => void;
    client.impl('createWallet', () => new Promise((_res, rej) => { rejectCreate = rej as never; }));
    const promise = engine.restoreWallet(restoreReq);
    await flush();
    const getInfoBefore = client.countOf('getInfo');
    engine.dispose();
    await assert.rejects(() => promise, /disposed/);
    const phaseAfterDispose = engine.getSnapshot().phase;
    rejectCreate(new Error('scan died'));
    await flush();
    assert.equal(client.countOf('getInfo'), getInfoBefore);
    assert.equal(engine.getSnapshot().phase, phaseAfterDispose);
  });

  it('a concurrent second restoreWallet rejects while the first stays pending', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const { client, engine } = await needsWalletEngine();
    // The scan (createWallet) hangs, keeping the first restore unsettled.
    client.impl('createWallet', () => new Promise(() => undefined));
    const first = engine.restoreWallet(restoreReq);
    await flush();
    await assert.rejects(() => engine.restoreWallet(restoreReq), /already in flight/);
    // The first call is unaffected by the rejected second call: it still
    // resolves normally via the readiness poll.
    client.info = readyInfo;
    mock.timers.tick(1500);
    await flush();
    const info = await first;
    assert.equal(info.walletReady, true);
    engine.dispose();
    mock.timers.reset();
  });

  it('dispose rejects a pending restore', async () => {
    const { client, engine } = await needsWalletEngine();
    client.impl('createWallet', () => new Promise(() => undefined));
    const promise = engine.restoreWallet(restoreReq);
    await flush();
    engine.dispose();
    await assert.rejects(() => promise, /disposed/);
  });

  it('an empty mnemonic rejects with /mnemonic/ and dispatches nothing', async () => {
    const { engine } = await needsWalletEngine();
    const before = engine.getSnapshot().phase;
    await assert.rejects(
      () => engine.restoreWallet({ ...restoreReq, mnemonic: [] }),
      /mnemonic/,
    );
    assert.equal(engine.getSnapshot().phase, before);
  });
});

describe('engine ready-phase processes', () => {
  it('opens the activity stream on ready and closes it on stop', async () => {
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    assert.equal(client.countOf('startActivity'), 1);
    await engine.stop();
    assert.equal(client.countOf('stopActivity'), 1);
    engine.dispose();
  });

  it('an activity event debounces into a settle-reconcile refresh', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    const balancesBefore = client.countOf('balance');
    client.emit({ type: 'activity', payload: { cursor: 1 } as Entry });
    mock.timers.tick(250);
    await flush();
    assert.ok(client.countOf('balance') > balancesBefore);
    engine.dispose();
    mock.timers.reset();
  });

  it('reconciles on stream loss and retries from the last cursor', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);

    client.emit({ type: 'activity', payload: { cursor: 12 } as Entry });
    const listsBefore = client.countOf('list');
    client.emit({ type: 'activityStream', payload: { state: 'ended' } });
    await flush();
    assert.ok(client.countOf('list') > listsBefore);

    mock.timers.tick(1000);
    await flush();
    const opens = client.calls.filter((call) => call.method === 'startActivity');
    assert.deepEqual(opens.at(-1)?.args[0], {
      includeExisting: false,
      cursor: 12,
    });
    engine.dispose();
    mock.timers.reset();
  });

  it('treats replayed entries as idempotent refresh notifications', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    client.listValue = {
      activity: { entries: [{ id: 'canonical', cursor: 0 }] },
    } as ListResult;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);

    const replay = { id: 'replayed', cursor: 12 } as Entry;
    client.emit({ type: 'activity', payload: replay });
    client.emit({ type: 'activity', payload: replay });
    mock.timers.tick(250);
    await flush();

    assert.deepEqual(
      engine.getSnapshot().activity.map((entry) => entry.id),
      ['canonical'],
    );
    engine.dispose();
    mock.timers.reset();
  });

  it('five consecutive background refresh failures escalate to error', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.fail('getInfo', new Error('gone'));
    for (let i = 0; i < 5; i++) {
      client.emit({ type: 'activity', payload: { cursor: i + 1 } as Entry });
      mock.timers.tick(250);
      await flush();
    }
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'error');
    assert.match(snap.error?.message ?? '', /background refreshes/);
    engine.dispose();
    mock.timers.reset();
  });

  it('background refresh exhaustion outside ready does not set the error', async () => {
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    await engine.stop();
    assert.equal(engine.getSnapshot().phase, 'stopped');
    // Drive 5 consecutive background-refresh failures from outside 'ready'.
    // send() kicks a background refresh regardless of phase, so this proves
    // the phase guard in the backgroundRefreshExhausted dispatch: without it,
    // the 5th failure would still land the "stopped responding" error patch
    // even though the transition itself is ignored outside 'ready'.
    client.fail('getInfo', new Error('daemon gone'));
    for (let i = 0; i < 5; i++) {
      await engine.send({} as never).catch(() => undefined);
      await flush();
    }
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'stopped');
    assert.equal(snap.error, null);
    engine.dispose();
  });

  it('a dead activity stream escalates to error with the stream message', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    client.startActivityImpl = () => Promise.reject(new Error('no stream'));
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    // Walk the full backoff ladder: 1s, 2s, 4s, 8s.
    for (const ms of [1000, 2000, 4000, 8000]) {
      mock.timers.tick(ms);
      await flush();
    }
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'error');
    assert.match(snap.error?.message ?? '', /activity stream/);
    engine.dispose();
    mock.timers.reset();
  });

  it('the sync poll refreshes while syncing and gives up after 5 failures', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = { walletState: 'syncing', walletReady: false } as WalletInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never).catch(() => undefined);
    assert.equal(engine.getSnapshot().phase, 'syncing');
    client.fail('getInfo', new Error('sync read failed'));
    client.fail('balance', new Error('sync read failed'));
    client.fail('list', new Error('sync read failed'));
    for (let i = 0; i < 5; i++) {
      mock.timers.tick(2000);
      await flush();
    }
    assert.equal(engine.getSnapshot().phase, 'error');
    engine.dispose();
    mock.timers.reset();
  });

  it('a syncing -> ready handoff stops the sync poller and starts the activity stream', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = { walletState: 'syncing', walletReady: false } as WalletInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never).catch(() => undefined);
    assert.equal(engine.getSnapshot().phase, 'syncing');
    const balancesBefore = client.countOf('balance');
    mock.timers.tick(2000);
    await flush();
    assert.ok(client.countOf('balance') > balancesBefore);
    // The daemon reports ready; the next sync-poll tick adopts it.
    client.info = readyInfo;
    mock.timers.tick(2000);
    await flush();
    assert.equal(engine.getSnapshot().phase, 'ready');
    assert.equal(client.countOf('startActivity'), 1);
    const getInfoAfterReady = client.countOf('getInfo');
    // Further time passing must not grow getInfo through the now-stopped sync
    // poller; only the activity-stream/settle-reconcile path may touch it,
    // and neither fires on a bare timer tick with no activity event.
    mock.timers.tick(2000);
    await flush();
    assert.equal(client.countOf('getInfo'), getInfoAfterReady);
    engine.dispose();
    mock.timers.reset();
  });

  it('a syncPollExhausted from an in-flight tick cannot mark a stopped engine', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = { walletState: 'syncing', walletReady: false } as WalletInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never).catch(() => undefined);
    assert.equal(engine.getSnapshot().phase, 'syncing');
    client.fail('getInfo', new Error('sync read failed'));
    client.fail('balance', new Error('sync read failed'));
    client.fail('list', new Error('sync read failed'));
    // Build up 4 consecutive failures, one below SYNC_POLL_FAILURE_LIMIT (5).
    for (let i = 0; i < 4; i++) {
      mock.timers.tick(2000);
      await flush();
    }
    assert.equal(engine.getSnapshot().phase, 'syncing');
    // Delay all three of the 5th tick's calls so the poller's tick is
    // genuinely still in flight (Promise.all unsettled) when stop() lands:
    // the poller's interval clears immediately, but the already-running tick
    // promise only resolves once released below, after the engine has
    // already reached 'stopped'. Without the phase === 'syncing' guard in the
    // sync poller's onExhausted callback, this stale tick would still call
    // onExhausted and stamp the fatal error onto that stopped snapshot.
    let rejectGetInfo!: (err: unknown) => void;
    let rejectBalance!: (err: unknown) => void;
    let rejectList!: (err: unknown) => void;
    client.impl('getInfo', () => new Promise((_res, rej) => { rejectGetInfo = rej; }));
    client.impl('balance', () => new Promise((_res, rej) => { rejectBalance = rej; }));
    client.impl('list', () => new Promise((_res, rej) => { rejectList = rej; }));
    mock.timers.tick(2000);
    await flush();
    await engine.stop();
    assert.equal(engine.getSnapshot().phase, 'stopped');
    // Now release the stale in-flight tick's calls.
    rejectGetInfo(new Error('sync read failed'));
    rejectBalance(new Error('sync read failed'));
    rejectList(new Error('sync read failed'));
    await flush();
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'stopped');
    assert.equal(snap.error, null);
    engine.dispose();
    mock.timers.reset();
  });

  it('stopCompleted clears a previously-set snapshot error', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.fail('getInfo', new Error('gone'));
    for (let i = 0; i < 5; i++) {
      client.emit({ type: 'activity', payload: { cursor: i + 1 } as Entry });
      mock.timers.tick(250);
      await flush();
    }
    assert.equal(engine.getSnapshot().phase, 'error');
    assert.ok(engine.getSnapshot().error);
    await engine.stop();
    const snap = engine.getSnapshot();
    assert.equal(snap.phase, 'stopped');
    assert.equal(snap.error, null);
    engine.dispose();
    mock.timers.reset();
  });

  it('serializes overlapping background refreshes: the second fetch cannot start before the first settles', async () => {
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    const releases: Array<(balance: unknown) => void> = [];
    let callIndex = 0;
    client.impl('balance', () => {
      const idx = callIndex++;

      return new Promise((resolve) => {
        releases[idx] = resolve as (balance: unknown) => void;
      });
    });
    // Kick two overlapping background refreshes; the second is queued behind
    // the first via the engine's serialized #chain.
    void engine.send({} as never);
    await flush();
    void engine.send({} as never);
    await flush();
    // Only the first balance() call has started: the chain must not let the
    // second start before the first resolves, so out-of-order resolution of
    // concurrent fetches is impossible by construction.
    assert.equal(callIndex, 1);
    releases[0]({ confirmedSat: 1 });
    await flush();
    assert.equal(callIndex, 2);
    releases[1]({ confirmedSat: 2 });
    await flush();
    // The later-started fetch's result is what lands in the snapshot.
    assert.equal(
      (engine.getSnapshot().balance as { confirmedSat: number }).confirmedSat,
      2,
    );
    engine.dispose();
  });

  it('the background refresh failure counter resets on success (consecutive, not cumulative)', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    client.fail('getInfo', new Error('gone'));
    for (let i = 0; i < 4; i++) {
      client.emit({ type: 'activity', payload: { cursor: i + 1 } as Entry });
      mock.timers.tick(250);
      await flush();
    }
    assert.equal(engine.getSnapshot().phase, 'ready');
    // Heal the client and drive one successful refresh cycle: the counter
    // must reset here rather than carry the prior 4 failures forward.
    client.stub('getInfo', client.info);
    client.emit({ type: 'activity', payload: { cursor: 5 } as Entry });
    mock.timers.tick(250);
    await flush();
    assert.equal(engine.getSnapshot().phase, 'ready');
    client.fail('getInfo', new Error('gone again'));
    for (let i = 0; i < 4; i++) {
      client.emit({ type: 'activity', payload: { cursor: i + 6 } as Entry });
      mock.timers.tick(250);
      await flush();
    }
    // Only 4 consecutive failures since the reset, one short of
    // BACKGROUND_REFRESH_FAILURE_LIMIT, so the phase must still be ready. A
    // cumulative counter would have reached 8 and escalated to error.
    assert.equal(engine.getSnapshot().phase, 'ready');
    engine.dispose();
    mock.timers.reset();
  });
});

describe('engine exit verbs', () => {
  it('exit forwards to the client and kicks a refresh', async () => {
    const client = new FakeWavelengthClient();
    client.stub('exit', {
      path: 'unilateral',
      cooperative: false,
      queuedOutpoints: [],
      created: true,
      actorID: 'a',
      cooperativeError: '',
    });
    const engine = createWalletEngine({ client });
    const before = client.countOf('list');
    await engine.exit({ outpoint: 'a:0', forceUnrollAck: FORCE_UNROLL_ACK });
    await flush();
    assert.equal(client.countOf('exit'), 1);
    // #kickRefresh triggers a background list-based refresh.
    assert.ok(client.countOf('list') > before);
    engine.dispose();
  });

  it('getExitPlan does not kick a refresh', async () => {
    const client = new FakeWavelengthClient();
    client.stub('getExitPlan', {
      plans: [],
      feeRateSatPerVByte: 1,
      canStart: true,
      totalFundingShortfallSat: 0,
      totalRecommendedFundingSat: 0,
    });
    const engine = createWalletEngine({ client });
    const before = client.countOf('list');
    await engine.getExitPlan({ outpoints: ['a:0'] });
    await flush();
    assert.equal(client.countOf('list'), before);
    engine.dispose();
  });

  it('exitBatch injects the client and refreshes once per started exit', async () => {
    const client = new FakeWavelengthClient();
    client.impl('getExitPlan', () => ({
      plans: [],
      feeRateSatPerVByte: 1,
      canStart: true,
      totalFundingShortfallSat: 0,
      totalRecommendedFundingSat: 0,
    }));
    client.impl('exit', () => ({
      path: 'unilateral',
      cooperative: false,
      queuedOutpoints: [],
      created: true,
      actorID: 'a',
      cooperativeError: '',
    }));
    const engine = createWalletEngine({ client });
    const before = client.countOf('list');
    const result = await engine.exitBatch({
      mode: 'unilateral',
      outpoints: ['a:0', 'b:1'],
    });
    await flush();
    assert.equal(result.started.length, 2);
    assert.ok(client.countOf('list') >= before + 2);
    engine.dispose();
  });

  it('list forwards to the client without a refresh', async () => {
    const client = new FakeWavelengthClient();
    client.stub('list', { view: 'vtxos', vtxos: { vtxos: [], total: 0 } });
    const engine = createWalletEngine({ client });
    const before = client.countOf('list');
    const res = await engine.list({ view: 'vtxos' });
    assert.equal(res.view, 'vtxos');
    // one explicit list call, no extra refresh-driven list.
    assert.equal(client.countOf('list'), before + 1);
    engine.dispose();
  });

  it('sweepWallet previews (broadcast:false) without kicking a refresh', async () => {
    const client = new FakeWavelengthClient();
    client.stub('sweepWallet', {
      inputs: [],
      totalInputSat: 0,
      estimatedFeeSat: 0,
      netAmountSat: 0,
      feeRateSatPerVByte: 1,
      canBroadcast: false,
      txid: '',
      failureReason: '',
    });
    const engine = createWalletEngine({ client });
    const before = client.countOf('list');
    await engine.sweepWallet({ destinationAddress: 'addr1', broadcast: false });
    await flush();
    assert.equal(client.countOf('sweepWallet'), 1);
    // A preview moves no money, so nothing to refresh.
    assert.equal(client.countOf('list'), before);
    engine.dispose();
  });

  it('sweepWallet broadcasts (broadcast:true) and kicks a refresh', async () => {
    const client = new FakeWavelengthClient();
    client.stub('sweepWallet', {
      inputs: [],
      totalInputSat: 0,
      estimatedFeeSat: 0,
      netAmountSat: 0,
      feeRateSatPerVByte: 1,
      canBroadcast: true,
      txid: 'txid-1',
      failureReason: '',
    });
    const engine = createWalletEngine({ client });
    const before = client.countOf('list');
    await engine.sweepWallet({ destinationAddress: 'addr1', broadcast: true });
    await flush();
    assert.equal(client.countOf('sweepWallet'), 1);
    // #kickRefresh triggers a background list-based refresh.
    assert.ok(client.countOf('list') > before);
    engine.dispose();
  });
});

describe('engine dispose guards', () => {
  it('mutators reject with /disposed/ once the engine is disposed', async () => {
    const client = new FakeWavelengthClient();
    client.info = readyInfo;
    const engine = createWalletEngine({ client });
    client.resolveReady();
    await flush();
    await engine.start({} as never);
    engine.dispose();
    await assert.rejects(() => engine.send({} as never), /disposed/);
    await assert.rejects(() => engine.start({} as never), /disposed/);
  });
});

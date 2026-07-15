import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FakeWavelengthClient } from './testing/fake-client.ts';
import { exitBatch, isExitInfeasibilityFundable } from './exit.ts';

describe('isExitInfeasibilityFundable', () => {
  it('classifies funding shortfalls as fundable', () => {
    assert.equal(isExitInfeasibilityFundable('wallet_underfunded'), true);
    assert.equal(isExitInfeasibilityFundable('wallet_too_few_inputs'), true);
  });

  it('classifies structural reasons as not fundable', () => {
    assert.equal(isExitInfeasibilityFundable('sweep_below_dust'), false);
    assert.equal(isExitInfeasibilityFundable('uneconomical'), false);
    assert.equal(isExitInfeasibilityFundable('unspecified'), false);
  });
});

describe('exitBatch cooperative', () => {
  it('starts every outpoint and forwards the destination', async () => {
    const client = new FakeWavelengthClient();
    client.impl('exit', (req) => ({
      path: 'cooperative',
      cooperative: true,
      queuedOutpoints: [(req as { outpoint: string }).outpoint],
      created: false,
      actorID: '',
      cooperativeError: '',
    }));
    const result = await exitBatch({
      mode: 'cooperative',
      outpoints: ['a:0', 'b:1'],
      destination: 'bcrt1qdest',
      client,
    });
    assert.equal(result.started.length, 2);
    assert.deepEqual(result.remaining, []);
    assert.equal(result.stoppedBy, undefined);
    assert.deepEqual(client.calls.map((c) => c.args[0]), [
      { outpoint: 'a:0', destination: 'bcrt1qdest' },
      { outpoint: 'b:1', destination: 'bcrt1qdest' },
    ]);
  });

  it('stops cleanly on the first rejection and reports the remainder', async () => {
    const client = new FakeWavelengthClient();
    let n = 0;
    client.impl('exit', (req) => {
      n += 1;
      if (n === 2) throw new Error('round unavailable');
      return {
        path: 'cooperative',
        cooperative: true,
        queuedOutpoints: [(req as { outpoint: string }).outpoint],
        created: false,
        actorID: '',
        cooperativeError: '',
      };
    });
    const events: string[] = [];
    const result = await exitBatch({
      mode: 'cooperative',
      outpoints: ['a:0', 'b:1', 'c:2'],
      client,
      onEvent: (e) => events.push(e.type),
    });
    assert.equal(result.started.length, 1);
    assert.deepEqual(result.remaining, ['b:1', 'c:2']);
    assert.equal(result.stoppedBy?.reason, 'rejected');
    assert.equal(
      (result.stoppedBy as { reason: 'rejected'; outpoint: string }).outpoint,
      'b:1',
    );
    assert.ok(events.includes('stopped'));
  });

  it('aborts before starting when the signal is already aborted', async () => {
    const client = new FakeWavelengthClient();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () =>
        exitBatch({
          mode: 'cooperative',
          outpoints: ['a:0'],
          client,
          signal: controller.signal,
        }),
      (err: Error) => err.name === 'AbortError',
    );
    assert.equal(client.calls.length, 0);
  });
});

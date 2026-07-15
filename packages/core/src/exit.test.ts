import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FakeWavelengthClient } from './testing/fake-client.ts';
import { exitBatch, isExitInfeasibilityFundable } from './exit.ts';
import type { GetExitPlanResult } from './results.ts';

function plan(overrides: Partial<GetExitPlanResult> = {}): GetExitPlanResult {
  return {
    plans: [],
    feeRateSatPerVByte: 1,
    canStart: true,
    totalFundingShortfallSat: 0,
    totalRecommendedFundingSat: 0,
    ...overrides,
  };
}

function planEntry(outpoint: string, over: Record<string, unknown> = {}) {
  return {
    outpoint,
    fundingAddress: '',
    requiredConfirmations: 0,
    requiredFeeUTXOCount: 0,
    usableFeeUTXOCount: 0,
    recommendedUTXOAmountSat: 0,
    recommendedTotalFundingSat: 0,
    fundingShortfallSat: 0,
    canStart: true,
    infeasibilityReason: 'unspecified',
    exitJobFound: false,
    exitStatus: 'unspecified',
    sweepTxid: '',
    lastError: '',
    err: '',
    ...over,
  };
}

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

describe('exitBatch unilateral', () => {
  it('starts nothing when the plan cannot start', async () => {
    const client = new FakeWavelengthClient();
    client.impl('getExitPlan', () => plan({ canStart: false }));
    const result = await exitBatch({
      mode: 'unilateral',
      outpoints: ['a:0'],
      client,
    });
    assert.equal(result.started.length, 0);
    assert.deepEqual(result.remaining, ['a:0']);
    assert.equal(result.stoppedBy?.reason, 'infeasible');
    assert.equal(client.countOf('exit'), 0);
  });

  it('skips outpoints that already have an exit job', async () => {
    const client = new FakeWavelengthClient();
    client.impl('getExitPlan', () =>
      plan({
        plans: [planEntry('a:0', { exitJobFound: true }), planEntry('b:1')],
      }),
    );
    client.impl('exit', (req) => ({
      path: 'unilateral',
      cooperative: false,
      queuedOutpoints: [],
      created: true,
      actorID: 'actor-' + (req as { outpoint: string }).outpoint,
      cooperativeError: '',
    }));
    const result = await exitBatch({
      mode: 'unilateral',
      outpoints: ['a:0', 'b:1'],
      client,
    });
    assert.deepEqual(result.skipped, ['a:0']);
    assert.equal(result.started.length, 1);
    assert.equal(result.started[0].outpoint, 'b:1');
  });

  it('re-plans between starts and stops when it turns infeasible', async () => {
    const client = new FakeWavelengthClient();
    let planCall = 0;
    client.impl('getExitPlan', () => {
      planCall += 1;
      // First plan: both feasible. Second plan (after first start): infeasible.
      return planCall === 1
        ? plan({ plans: [planEntry('a:0'), planEntry('b:1')] })
        : plan({ canStart: false, plans: [planEntry('b:1', { canStart: false })] });
    });
    client.impl('exit', () => ({
      path: 'unilateral',
      cooperative: false,
      queuedOutpoints: [],
      created: true,
      actorID: 'x',
      cooperativeError: '',
    }));
    const result = await exitBatch({
      mode: 'unilateral',
      outpoints: ['a:0', 'b:1'],
      client,
    });
    assert.equal(result.started.length, 1);
    assert.deepEqual(result.remaining, ['b:1']);
    assert.equal(result.stoppedBy?.reason, 'infeasible');
  });

  it('treats a mid-batch exit rejection as a clean stop', async () => {
    const client = new FakeWavelengthClient();
    client.impl('getExitPlan', () =>
      plan({ plans: [planEntry('a:0'), planEntry('b:1')] }),
    );
    let n = 0;
    client.impl('exit', () => {
      n += 1;
      if (n === 2) throw new Error('ExitWalletTooFewInputs');
      return {
        path: 'unilateral',
        cooperative: false,
        queuedOutpoints: [],
        created: true,
        actorID: 'x',
        cooperativeError: '',
      };
    });
    const result = await exitBatch({
      mode: 'unilateral',
      outpoints: ['a:0', 'b:1'],
      client,
    });
    assert.equal(result.started.length, 1);
    assert.deepEqual(result.remaining, ['b:1']);
    assert.equal(result.stoppedBy?.reason, 'rejected');
  });

  it('re-plans after dropping an already-running outpoint before gating on canStart', async () => {
    const client = new FakeWavelengthClient();
    let planCall = 0;
    client.impl('getExitPlan', () => {
      planCall += 1;
      // First plan: a:0 is already running (its leased fee inputs drag the
      // aggregate canStart false); b:1 is fundable on its own. The fix must
      // re-plan against the reduced remaining set (just b:1) instead of
      // gating on this stale aggregate.
      if (planCall === 1) {
        return plan({
          canStart: false,
          plans: [
            planEntry('a:0', { exitJobFound: true, canStart: false }),
            planEntry('b:1', { canStart: true }),
          ],
        });
      }

      // Second plan (after dropping a:0): only b:1 remains, and it is
      // feasible on its own.
      return plan({ canStart: true, plans: [planEntry('b:1', { canStart: true })] });
    });
    client.impl('exit', () => ({
      path: 'unilateral',
      cooperative: false,
      queuedOutpoints: [],
      created: true,
      actorID: 'x',
      cooperativeError: '',
    }));
    const result = await exitBatch({
      mode: 'unilateral',
      outpoints: ['a:0', 'b:1'],
      client,
    });
    assert.deepEqual(result.skipped, ['a:0']);
    assert.equal(result.started.length, 1);
    assert.equal(result.started[0].outpoint, 'b:1');
    assert.equal(result.stoppedBy, undefined);
  });

  it('emits a planned event carrying the plan', async () => {
    const client = new FakeWavelengthClient();
    client.impl('getExitPlan', () => plan({ plans: [planEntry('a:0')] }));
    client.impl('exit', () => ({
      path: 'unilateral',
      cooperative: false,
      queuedOutpoints: [],
      created: true,
      actorID: 'x',
      cooperativeError: '',
    }));
    const planned: GetExitPlanResult[] = [];
    await exitBatch({
      mode: 'unilateral',
      outpoints: ['a:0'],
      client,
      onEvent: (e) => {
        if (e.type === 'planned') planned.push(e.plan);
      },
    });
    assert.equal(planned.length >= 1, true);
  });
});

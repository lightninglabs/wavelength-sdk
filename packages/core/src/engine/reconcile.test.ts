import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Balance } from '../results.ts';
import { SettleReconciler, balancesEqual } from './reconcile.ts';

async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

const bal = (confirmed: number): Balance =>
  ({ confirmedSat: confirmed }) as unknown as Balance;

describe('balancesEqual', () => {
  it('compares by field values across both key sets', () => {
    assert.equal(balancesEqual(bal(1), bal(1)), true);
    assert.equal(balancesEqual(bal(1), bal(2)), false);
    assert.equal(balancesEqual(null, bal(1)), false);
    assert.equal(balancesEqual(null, null), true);
  });
});

describe('SettleReconciler', () => {
  it('stops probing once the balance moved off baseline and held steady', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    // Reads: initial refresh returns stale 1, first probe returns 2 (moved,
    // not yet steady), second probe returns 2 (moved and steady: stop).
    const reads = [bal(1), bal(2), bal(2), bal(99)];
    let i = 0;
    const rec = new SettleReconciler({
      refresh: async () => ({ ok: true, balance: reads[i++] }),
      baseline: () => bal(1),
    });
    rec.trigger();
    await flush();
    mock.timers.tick(750);
    await flush();
    mock.timers.tick(1500);
    await flush();
    assert.equal(i, 3);
    // The schedule has stopped: no further reads on the last delay.
    mock.timers.tick(3000);
    await flush();
    assert.equal(i, 3);
    mock.timers.reset();
  });

  it('probes the whole bounded schedule when the balance never moves', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    let reads = 0;
    const rec = new SettleReconciler({
      refresh: async () => { reads += 1; return { ok: true, balance: bal(1) }; },
      baseline: () => bal(1),
    });
    rec.trigger();
    await flush();
    mock.timers.tick(750);
    await flush();
    mock.timers.tick(1500);
    await flush();
    mock.timers.tick(3000);
    await flush();
    // One initial read plus three probes, then the schedule is exhausted.
    assert.equal(reads, 4);
    mock.timers.tick(10000);
    await flush();
    assert.equal(reads, 4);
    mock.timers.reset();
  });

  it('a new trigger retires the previous cycle wherever it is', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    let reads = 0;
    const rec = new SettleReconciler({
      refresh: async () => { reads += 1; return { ok: true, balance: bal(reads) }; },
      baseline: () => bal(0),
    });
    rec.trigger();
    await flush();
    assert.equal(reads, 1);
    rec.trigger();
    await flush();
    assert.equal(reads, 2);
    // Only the second cycle's probes run; each read moves the balance, so the
    // full schedule is probed once, not twice.
    mock.timers.tick(750);
    await flush();
    mock.timers.tick(1500);
    await flush();
    mock.timers.tick(3000);
    await flush();
    assert.equal(reads, 5);
    mock.timers.reset();
  });

  it('a failed refresh ends the cycle', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    let reads = 0;
    const rec = new SettleReconciler({
      refresh: async () => { reads += 1; return { ok: false, balance: null }; },
      baseline: () => bal(0),
    });
    rec.trigger();
    await flush();
    mock.timers.tick(750);
    await flush();
    assert.equal(reads, 1);
    mock.timers.reset();
  });

  it('cancel() retires an in-flight cycle', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    let reads = 0;
    const rec = new SettleReconciler({
      refresh: async () => { reads += 1; return { ok: true, balance: bal(reads) }; },
      baseline: () => bal(0),
    });
    rec.trigger();
    await flush();
    assert.equal(reads, 1);
    // Cancel before the first probe timer fires; no further refreshes should
    // run as the schedule ticks through.
    rec.cancel();
    mock.timers.tick(750);
    await flush();
    mock.timers.tick(1500);
    await flush();
    mock.timers.tick(3000);
    await flush();
    assert.equal(reads, 1);
    mock.timers.reset();
  });
});

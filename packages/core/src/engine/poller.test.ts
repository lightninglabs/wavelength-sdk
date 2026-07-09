import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Poller } from './poller.ts';

// Drains microtasks between mocked timer ticks so promise chains settle.
async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('Poller', () => {
  it('ticks on the interval and immediately when configured', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    let ticks = 0;
    const poller = new Poller({
      intervalMs: 1000,
      immediate: true,
      tick: async () => { ticks += 1; },
    });
    poller.start();
    await flush();
    assert.equal(ticks, 1);
    mock.timers.tick(1000);
    await flush();
    assert.equal(ticks, 2);
    poller.stop();
    mock.timers.tick(5000);
    await flush();
    assert.equal(ticks, 2);
    mock.timers.reset();
  });

  it('stops and reports after failureLimit consecutive rejections', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    let exhausted: unknown = null;
    const poller = new Poller({
      intervalMs: 1000,
      failureLimit: 3,
      tick: async () => { throw new Error('down'); },
      onExhausted: (err) => { exhausted = err; },
    });
    poller.start();
    for (let i = 0; i < 3; i++) {
      mock.timers.tick(1000);
      await flush();
    }
    assert.ok(exhausted instanceof Error);
    assert.equal((exhausted as Error).message, 'down');
    assert.equal(poller.running, false);
    mock.timers.reset();
  });

  it('a tick slower than the interval suppresses the overlapping fire', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    let ticks = 0;
    let release!: () => void;
    const held = new Promise<void>((res) => { release = res; });
    const poller = new Poller({
      intervalMs: 1000,
      tick: async () => {
        ticks += 1;
        await held;
      },
    });
    poller.start();
    // The first tick fires and stays in flight (blocked on `held`).
    mock.timers.tick(1000);
    await flush();
    assert.equal(ticks, 1);
    // A second interval fires while the first tick is still unresolved: the
    // overlap guard must drop it rather than starting a concurrent tick.
    mock.timers.tick(1000);
    await flush();
    assert.equal(ticks, 1);
    // Releasing the first tick lets the poller resume on the next interval.
    release();
    await flush();
    mock.timers.tick(1000);
    await flush();
    assert.equal(ticks, 2);
    poller.stop();
    mock.timers.reset();
  });

  it('a success resets the failure counter', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    let calls = 0;
    let exhausted = false;
    const poller = new Poller({
      intervalMs: 1000,
      failureLimit: 3,
      tick: async () => {
        calls += 1;
        if (calls % 3 !== 0) {
          throw new Error('flaky');
        }
      },
      onExhausted: () => { exhausted = true; },
    });
    poller.start();
    for (let i = 0; i < 9; i++) {
      mock.timers.tick(1000);
      await flush();
    }
    assert.equal(exhausted, false);
    assert.equal(poller.running, true);
    poller.stop();
    mock.timers.reset();
  });
});

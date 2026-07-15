import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityStreamOptions } from '../activity-options.ts';
import { ActivityStream } from './activity.ts';

async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// A stub client whose startActivity behavior is keyed by call index.
function stubClient(failing: (callIndex: number) => boolean) {
  let count = 0;
  const calls: ActivityStreamOptions[] = [];
  let stops = 0;
  return {
    client: {
      startActivity(opts: ActivityStreamOptions) {
        calls.push(opts);
        const idx = count++;
        return failing(idx)
          ? Promise.reject(new Error('open failed'))
          : Promise.resolve();
      },
      stopActivity() { stops += 1; },
    },
    calls,
    opens: () => count,
    stops: () => stops,
  };
}

describe('ActivityStream', () => {
  it('opens with includeExisting and debounces activity into onActivity', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const stub = stubClient(() => false);
    let refreshes = 0;
    const stream = new ActivityStream({
      client: stub.client,
      onActivity: () => { refreshes += 1; },
      onReconcile: () => undefined,
      onDead: () => assert.fail('must not die'),
    });
    stream.start();
    await flush();
    assert.deepEqual(stub.calls[0], { includeExisting: true, cursor: 0 });
    stream.noteActivity({ cursor: 1 });
    stream.noteActivity({ cursor: 2 });
    mock.timers.tick(250);
    assert.equal(refreshes, 1);
    stream.stop();
    assert.equal(stub.stops(), 1);
    mock.timers.reset();
  });

  it('reopens with doubling capped backoff and dies after 5 failures', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const stub = stubClient(() => true);
    let dead: Error | null = null;
    const stream = new ActivityStream({
      client: stub.client,
      onActivity: () => undefined,
      onReconcile: () => undefined,
      onDead: (err) => { dead = err; },
    });
    stream.start();
    await flush();
    assert.equal(stub.opens(), 1);
    // Failure 1 schedules a retry at 1000ms (backoff doubles after firing).
    mock.timers.tick(1000);
    await flush();
    assert.equal(stub.opens(), 2);
    mock.timers.tick(2000);
    await flush();
    assert.equal(stub.opens(), 3);
    mock.timers.tick(4000);
    await flush();
    assert.equal(stub.opens(), 4);
    mock.timers.tick(8000);
    await flush();
    assert.equal(stub.opens(), 5);
    assert.ok(dead instanceof Error);
    assert.match((dead as Error).message, /activity stream/);
    // Dead stream schedules no further reopens.
    mock.timers.tick(60000);
    await flush();
    assert.equal(stub.opens(), 5);
    mock.timers.reset();
  });

  it('a successful reopen resets the failure count and backoff', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const stub = stubClient((idx) => idx === 0 || idx === 1);
    let dead = false;
    const stream = new ActivityStream({
      client: stub.client,
      onActivity: () => undefined,
      onReconcile: () => undefined,
      onDead: () => { dead = true; },
    });
    stream.start();
    await flush();
    mock.timers.tick(1000);
    await flush();
    mock.timers.tick(2000);
    await flush();
    // Third open succeeded; a later loss retries from the initial backoff.
    stream.noteStreamLost();
    mock.timers.tick(1000);
    await flush();
    assert.equal(stub.opens(), 4);
    assert.equal(dead, false);
    stream.stop();
    mock.timers.reset();
  });

  it('reopens from the greatest safe positive cursor without full replay', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const stub = stubClient(() => false);
    let reconciles = 0;
    const stream = new ActivityStream({
      client: stub.client,
      onActivity: () => undefined,
      onReconcile: () => { reconciles += 1; },
      onDead: () => assert.fail('must not die'),
    });
    stream.start();
    await flush();
    assert.deepEqual(stub.calls[0], { includeExisting: true, cursor: 0 });

    stream.noteActivity({ cursor: 4 });
    stream.noteActivity({ cursor: 2 });
    stream.noteActivity({ cursor: Number.MAX_SAFE_INTEGER + 1 });
    stream.noteStreamLost();
    assert.equal(reconciles, 1);
    mock.timers.tick(1000);
    await flush();
    assert.deepEqual(stub.calls[1], { includeExisting: false, cursor: 4 });
    stream.stop();
    mock.timers.reset();
  });

  it('clears the retained cursor when a lifecycle stops', async () => {
    const stub = stubClient(() => false);
    const stream = new ActivityStream({
      client: stub.client,
      onActivity: () => undefined,
      onReconcile: () => undefined,
      onDead: () => assert.fail('must not die'),
    });
    stream.start();
    await flush();
    stream.noteActivity({ cursor: 8 });
    stream.stop();
    stream.start();
    await flush();
    assert.deepEqual(stub.calls[1], { includeExisting: true, cursor: 0 });
    stream.stop();
  });

  it('opens a new lifecycle while the stopped lifecycle open is pending', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const firstOpen = deferred<void>();
    const secondOpen = deferred<void>();
    const calls: ActivityStreamOptions[] = [];
    let dead = false;
    const stream = new ActivityStream({
      client: {
        startActivity(opts) {
          calls.push(opts);
          return calls.length === 1 ? firstOpen.promise : secondOpen.promise;
        },
        stopActivity() {},
      },
      onActivity: () => undefined,
      onReconcile: () => undefined,
      onDead: () => { dead = true; },
    });

    stream.start();
    stream.stop();
    stream.start();

    assert.deepEqual(calls, [
      { includeExisting: true, cursor: 0 },
      { includeExisting: true, cursor: 0 },
    ]);

    firstOpen.reject(new Error('stale open failed'));
    secondOpen.resolve();
    await flush();
    mock.timers.tick(60_000);
    await flush();

    assert.equal(calls.length, 2);
    assert.equal(dead, false);
    stream.stop();
    mock.timers.reset();
  });
});

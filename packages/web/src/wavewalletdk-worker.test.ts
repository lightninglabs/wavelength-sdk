import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import vm from 'node:vm';

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('wavewalletdk worker activity lifecycle', () => {
  it('releases a terminal handle so a retry can subscribe again', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const listeners = new Map<string, Array<() => void>>();
    const posted: unknown[] = [];
    const subscribeRequests: unknown[] = [];
    const self: Record<string, unknown> = {
      postMessage: (message: unknown) => posted.push(message),
      addEventListener: (name: string, listener: () => void) => {
        const current = listeners.get(name) ?? [];
        current.push(listener);
        listeners.set(name, current);
      },
      wavewalletdkCall: async (method: string, params: unknown) => {
        assert.equal(method, 'subscribe');
        subscribeRequests.push(params);
        return { next: async () => null, close: () => undefined };
      },
    };
    vm.runInNewContext(source, {
      self,
      console,
      URL,
      Event: class Event {},
      setTimeout,
      clearTimeout,
    });
    for (const listener of listeners.get('wavewalletdk-ready') ?? []) listener();

    const onmessage = self.onmessage as (event: unknown) => Promise<void>;
    await onmessage({ data: { id: 1, method: '$startActivity', params: { cursor: 4 } } });
    await flush();
    await onmessage({ data: { id: 2, method: '$startActivity', params: { cursor: 4 } } });
    await flush();

    assert.equal(subscribeRequests.length, 2);
    assert.equal(posted.filter((message) =>
      (message as { event?: { type?: string } }).event?.type === 'activityStream'
    ).length, 2);
  });
});

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { afterEach, describe, it, mock } from 'node:test';

// Web source is intentionally bundler-oriented and uses extensionless internal
// imports. Teach node:test to resolve those source imports while it evaluates
// the transport classes below.
const typescriptURL = new URL(
  '../../../../node_modules/typescript/lib/typescript.js',
  import.meta.url,
).href;

register(
  `data:text/javascript,${encodeURIComponent(`
    import * as ts from ${JSON.stringify(typescriptURL)};

    export async function resolve(specifier, context, nextResolve) {
      try {
        return await nextResolve(specifier, context);
      } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.ts')) {
          return nextResolve(specifier + '.ts', context);
        }
        throw error;
      }
    }

    export async function load(url, context, nextLoad) {
      const result = await nextLoad(url, context);
      if (!url.endsWith('.ts')) return result;
      return {
        ...result,
        source: ts.transpileModule(String(result.source), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
      };
    }
  `)}`,
  import.meta.url,
);

type WorkerMessage = { id?: number; method?: string; params?: unknown; $init?: unknown };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

// loadVerifiedScript executes each bootstrap script via a <script src>
// pointed at a blob URL; this stub "runs" it by resolving onload on the
// next microtask, same as runtime.test.ts's stubDocument.
function stubDocument(): { baseURI: string; createElement: () => unknown; head: { append: (el: { onload?: () => void }) => void } } {
  return {
    baseURI: 'https://x/',
    createElement: () => {
      const el: { dataset: Record<string, string>; onload?: () => void } = {
        dataset: {},
      };
      return el;
    },
    head: {
      append: (el: { onload?: () => void }) =>
        queueMicrotask(() => el.onload?.()),
    },
  };
}

class FakeWorker {
  static latest: FakeWorker | undefined;
  readonly messages: WorkerMessage[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(_url: string | URL) {
    FakeWorker.latest = this;
  }

  postMessage(message: WorkerMessage): void {
    this.messages.push(message);
    if (message.method === '$startActivity') {
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: true } } as MessageEvent));
    }
  }

  terminate(): void {}
}

// AutoReplyWorker acknowledges every request with an empty ok result, so
// multi-step verbs (start = 'start' + 'getInfo') resolve without scripting
// each response.
class AutoReplyWorker extends FakeWorker {
  postMessage(message: WorkerMessage): void {
    this.messages.push(message);
    if (typeof message.id === 'number') {
      queueMicrotask(() =>
        this.onmessage?.({
          data: { id: message.id, ok: true, result: {} },
        } as MessageEvent),
      );
    }
  }
}

describe('activity transport requests', () => {
  it('forwards complete activity options in main and worker modes', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedCall = (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall;
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    const calls: Array<{ method: string; params: unknown }> = [];
    Object.defineProperty(globalThis, 'wavewalletdkCall', {
      configurable: true,
      value: async (method: string, params: unknown) => {
        calls.push({ method, params });
        return { next: () => new Promise<null>(() => undefined), close: () => undefined };
      },
    });
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });

    try {
      const main = new MainThreadWavelengthClient();
      await main.startActivity({
        includeExisting: true,
        kinds: ['receive', 'deposit'],
        cursor: 42,
      });
      assert.deepEqual(calls.at(-1), {
        method: 'subscribe',
        params: { includeExisting: true, kinds: ['receive', 'deposit'], cursor: 42 },
      });

      const worker = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const fakeWorker = FakeWorker.latest!;
      await worker.startActivity({ includeExisting: false, kinds: ['send'], cursor: 7 });
      const workerMessage = fakeWorker.messages.at(-1);
      assert.equal(workerMessage?.method, '$startActivity');
      assert.equal(typeof workerMessage?.id, 'number');
      assert.deepEqual(workerMessage?.params, {
        includeExisting: false,
        kinds: ['send'],
        cursor: 7,
      });
      main.dispose();
      worker.dispose();
    } finally {
      Object.defineProperty(globalThis, 'wavewalletdkCall', {
        configurable: true,
        value: savedCall,
      });
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });

  it('normalizes a worker structured-clone facade response in core', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const fakeWorker = FakeWorker.latest!;
      const response = client.callFacade('list');
      const request = fakeWorker.messages.at(-1);
      fakeWorker.onmessage?.({
        data: {
          id: request?.id,
          ok: true,
          result: {
            View: 'activity',
            Activity: { Entries: null },
            VTXOs: null,
            Onchain: null,
          },
        },
      } as MessageEvent);

      assert.deepEqual(await response, {
        view: 'activity',
        activity: { entries: [] },
        vtxos: undefined,
        onchain: undefined,
      });
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('normalizes streamed entries in main and worker modes', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedCall = (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall;
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    let next = 0;
    Object.defineProperty(globalThis, 'wavewalletdkCall', {
      configurable: true,
      value: async () => ({
        next: async () => next++ === 0
          ? { Cursor: 3, Progress: null, Request: null }
          : null,
        close: () => undefined,
      }),
    });
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });

    try {
      const expected = {
        type: 'activity',
        payload: { cursor: 3, progress: undefined, request: undefined },
      } as const;
      const mainEvents: unknown[] = [];
      const main = new MainThreadWavelengthClient();
      main.subscribe((event) => mainEvents.push(event));
      await main.startActivity();
      await Promise.resolve();
      assert.deepEqual(mainEvents[0], expected);

      const workerEvents: unknown[] = [];
      const worker = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      worker.subscribe((event) => workerEvents.push(event));
      FakeWorker.latest!.onmessage?.({
        data: {
          event: {
            type: 'activity',
            payload: { Cursor: 3, Progress: null, Request: null },
          },
        },
      } as MessageEvent);
      assert.deepEqual(workerEvents[0], expected);

      main.dispose();
      worker.dispose();
    } finally {
      Object.defineProperty(globalThis, 'wavewalletdkCall', {
        configurable: true,
        value: savedCall,
      });
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });

  for (const terminal of ['ended', 'failed'] as const) {
    it(`surfaces a ${terminal} main-thread stream and permits reopening`, async () => {
      const { MainThreadWavelengthClient } = await import('./main.ts');
      const savedCall = (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall;
      const savedAddEventListener = globalThis.addEventListener;
      const savedRemoveEventListener = globalThis.removeEventListener;
      let subscribeCalls = 0;
      Object.defineProperty(globalThis, 'wavewalletdkCall', {
        configurable: true,
        value: async () => {
          subscribeCalls += 1;
          return subscribeCalls === 1
            ? {
                next: async () => {
                  if (terminal === 'failed') {
                    throw new Error('stream broke');
                  }
                  return null;
                },
                close: () => undefined,
              }
            : {
                next: () => new Promise<null>(() => undefined),
                close: () => undefined,
              };
        },
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: () => undefined,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: () => undefined,
      });

      try {
        const events: unknown[] = [];
        const client = new MainThreadWavelengthClient();
        client.subscribe((event) => events.push(event));
        await client.startActivity();
        await Promise.resolve();
        await Promise.resolve();

        assert.deepEqual(events.at(-1), terminal === 'failed'
          ? {
              type: 'activityStream',
              payload: { state: 'failed', message: 'stream broke' },
            }
          : { type: 'activityStream', payload: { state: 'ended' } });

        await client.startActivity();
        assert.equal(subscribeCalls, 2);
        client.dispose();
      } finally {
        Object.defineProperty(globalThis, 'wavewalletdkCall', {
          configurable: true,
          value: savedCall,
        });
        Object.defineProperty(globalThis, 'addEventListener', {
          configurable: true,
          value: savedAddEventListener,
        });
        Object.defineProperty(globalThis, 'removeEventListener', {
          configurable: true,
          value: savedRemoveEventListener,
        });
      }
    });
  }

  it('surfaces a worker activity-stop failure', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const events: unknown[] = [];
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      client.subscribe((event) => events.push(event));
      const fakeWorker = FakeWorker.latest!;

      client.stopActivity();
      const request = fakeWorker.messages.at(-1);
      fakeWorker.onmessage?.({
        data: { id: request?.id, ok: false, error: 'close failed' },
      } as MessageEvent);
      await Promise.resolve();

      assert.deepEqual(events, [
        {
          type: 'log',
          payload: {
            level: 'warn',
            message: 'failed to close the activity stream: close failed',
          },
        },
      ]);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('does not warn when stopActivity runs after the worker runtime exited', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const warns: string[] = [];
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      client.subscribe((event) => {
        if (event.type === 'log' && event.payload.level === 'warn') {
          warns.push(event.payload.message);
        }
      });
      // The runtime has exited (a crash set this). The engine reconciles
      // processes on runtimeStopped and calls stopActivity(); it must own the
      // close as satisfied rather than reject against the dead-runtime request
      // guard and emit a spurious warn on every crash.
      (client as unknown as { runtimeExited: boolean }).runtimeExited = true;
      client.stopActivity();
      await Promise.resolve();
      await Promise.resolve();

      assert.deepEqual(warns, [], 'a stop after the runtime exited must not warn');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('coalesces concurrent main-thread activity opens', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const savedCall = (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    const opened = deferred<{ next: () => Promise<null>; close: () => void }>();
    let subscribeCalls = 0;
    Object.defineProperty(globalThis, 'wavewalletdkCall', {
      configurable: true,
      value: async (method: string) => {
        assert.equal(method, 'subscribe');
        subscribeCalls += 1;
        return opened.promise;
      },
    });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });

    try {
      const client = new MainThreadWavelengthClient();
      const first = client.startActivity();
      const second = client.startActivity();
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(subscribeCalls, 1);
      opened.resolve({
        next: () => new Promise<null>(() => undefined),
        close: () => undefined,
      });
      await Promise.all([first, second]);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'wavewalletdkCall', {
        configurable: true,
        value: savedCall,
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });

  it('closes a pending main-thread activity open when disposed', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const savedCall = (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    const opened = deferred<{ next: () => Promise<null>; close: () => void }>();
    let closes = 0;
    let nextCalls = 0;
    Object.defineProperty(globalThis, 'wavewalletdkCall', {
      configurable: true,
      value: async () => opened.promise,
    });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });

    try {
      const client = new MainThreadWavelengthClient();
      const start = client.startActivity();
      await Promise.resolve();
      await Promise.resolve();
      client.dispose();

      opened.resolve({
        next: async () => {
          nextCalls += 1;
          return null;
        },
        close: () => {
          closes += 1;
        },
      });
      await start;
      await Promise.resolve();

      assert.equal(closes, 1);
      assert.equal(nextCalls, 0);
    } finally {
      Object.defineProperty(globalThis, 'wavewalletdkCall', {
        configurable: true,
        value: savedCall,
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });

  it('fails a worker start() fast with wallet_locked when another tab holds the runtime', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AutoReplyWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            _name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) => Promise.resolve(callback(null)),
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, 'wallet_locked');

          return true;
        },
      );
      assert.ok(
        !FakeWorker.latest!.messages.some((message) => message.method === 'start'),
        'a locked start must not reach the worker',
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: savedNavigator,
      });
    }
  });

  it('holds the runtime lock across worker start() and releases it on stop()', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const { RUNTIME_LOCK_NAME } = await import('../runtime-lock.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const requests: string[] = [];
    let released = false;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AutoReplyWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) => {
            requests.push(name);

            return Promise.resolve(callback({ name })).then(() => {
              released = true;
            });
          },
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      assert.equal(requests.length, 1);
      assert.equal(requests[0], RUNTIME_LOCK_NAME);
      assert.equal(released, false);

      await client.stop();
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(released, true);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: savedNavigator,
      });
    }
  });

  it('serializes an overlapping stop behind an in-flight start', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const replyTo = (worker: FakeWorker, method: string) => {
      const req = worker.messages.find((m) => m.method === method);
      worker.onmessage?.({
        data: { id: req?.id, ok: true, result: {} },
      } as MessageEvent);
    };

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const worker = FakeWorker.latest!;

      // start() takes the lock and posts 'start', then awaits the daemon.
      const started = client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      await flush();
      assert.ok(worker.messages.some((m) => m.method === 'start'));

      // stop() issued while the start is still in flight must queue behind it,
      // not fire its own 'stop' RPC and release the lock mid-start.
      const stopped = client.stop();
      await flush();
      assert.ok(
        !worker.messages.some((m) => m.method === 'stop'),
        'an overlapping stop must wait for the in-flight start to finish',
      );

      // Let the start finish (its 'start' RPC, then the getInfo it triggers).
      replyTo(worker, 'start');
      await flush();
      replyTo(worker, 'getInfo');
      await started;
      await flush();

      // Only now does the queued stop run.
      assert.ok(
        worker.messages.some((m) => m.method === 'stop'),
        'the stop runs once the start has completed',
      );
      replyTo(worker, 'stop');
      await stopped;

      const order = worker.messages
        .filter((m) => ['start', 'getInfo', 'stop'].includes(m.method ?? ''))
        .map((m) => m.method);
      assert.deepEqual(order, ['start', 'getInfo', 'stop']);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('releases the runtime lock when the worker errors during the acquire window', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    // A lock whose grant is deferred until grantLock(), so a worker onerror can
    // land while start() is suspended on the acquire.
    let grantLock!: () => void;
    let released = false;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) =>
            new Promise((resolveRequest) => {
              grantLock = () =>
                resolveRequest(
                  Promise.resolve(callback({ name })).then(() => {
                    released = true;
                  }),
                );
            }),
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const worker = FakeWorker.latest!;
      const started = client
        .start({ network: 'regtest', arkServerAddress: 'h:7070' })
        .then(
          () => 'resolved',
          (err: unknown) => (err as { code?: string }).code,
        );

      // start() is suspended on the deferred acquire; the worker dies now.
      await new Promise((resolve) => setTimeout(resolve, 0));
      worker.onerror?.({ message: 'worker eval trap' } as ErrorEvent);
      // The grant lands after the death: the acquire resolves into a runtime
      // that is already gone, so the start must release the lock it just took
      // rather than strand the whole origin behind a dead runtime.
      grantLock();

      assert.equal(await started, 'worker_error');
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(
        released,
        true,
        'a worker death during the acquire window must not strand the lock',
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('resolves a stop queued behind a failed start instead of rejecting', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: RejectingWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      // The start fails and tears the worker down; the stop queued behind it
      // must own the shutdown (the runtime is already gone) rather than reject
      // against a dead worker and drag the engine onto an error screen.
      const started = client
        .start({ network: 'regtest', arkServerAddress: 'h:7070' })
        .then(() => 'resolved', () => 'start-failed');
      const stopped = client
        .stop()
        .then(() => 'resolved', (err: unknown) => `stop-failed:${(err as { code?: string }).code}`);

      assert.equal(await started, 'start-failed');
      assert.equal(await stopped, 'resolved');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('coalesces a redundant worker start instead of tearing the session down', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    // Acks the first start and every getInfo, but rejects a second start the
    // way a daemon that is already running would. The coalesce guard must never
    // post that second start: it returns the live session's info instead.
    class SecondStartRejectsWorker extends FakeWorker {
      starts = 0;
      postMessage(message: WorkerMessage): void {
        this.messages.push(message);
        if (typeof message.id !== 'number') {
          return;
        }
        const rejectStart = message.method === 'start' && ++this.starts > 1;
        queueMicrotask(() =>
          this.onmessage?.({
            data: rejectStart
              ? { id: message.id, ok: false, error: 'daemon already started' }
              : { id: message.id, ok: true, result: {} },
          } as MessageEvent),
        );
      }
    }
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: SecondStartRejectsWorker,
    });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      assert.equal(locks.state.released, false);

      // A second start on the live session must resolve without re-invoking the
      // daemon or freeing the lock. Before the coalesce guard this posted a
      // second 'start' RPC, whose rejection killed the healthy worker and
      // released the origin lock for other tabs.
      const info = await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      assert.ok(info, 'a redundant start resolves with the live session info');
      assert.equal(
        locks.state.released,
        false,
        'a redundant start must not free the running session lock',
      );
      const startRPCs = FakeWorker.latest!.messages.filter((m) => m.method === 'start');
      assert.equal(startRPCs.length, 1, 'a redundant start must not re-invoke the daemon');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('coalesces a redundant main-thread start instead of tearing the session down', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      navigator: (globalThis as { navigator?: unknown }).navigator,
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const locks = grantingLocks();
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    stub('navigator', locks.navigator);
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);
    // A callable runtime (so loadRuntime short-circuits) whose daemon acks the
    // first start and every getInfo but rejects a second start.
    let starts = 0;
    stub('wavewalletdkCall', async (method: string) => {
      if (method === 'start' && ++starts > 1) {
        throw new Error('daemon already started');
      }
      return {};
    });

    try {
      const client = new MainThreadWavelengthClient();
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      assert.equal(locks.state.released, false);

      // The recovery stop a failed re-start would trigger frees the lock; the
      // coalesce guard returns the live session's info instead, so neither the
      // session nor its lock is disturbed.
      const info = await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      assert.ok(info, 'a redundant start resolves with the live session info');
      assert.equal(
        locks.state.released,
        false,
        'a redundant main-thread start must not free the running session lock',
      );
      assert.equal(starts, 1, 'a redundant start must not re-invoke the daemon');
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('releases the main-thread lock when the runtime exits during the acquire window', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      navigator: (globalThis as { navigator?: unknown }).navigator,
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    // A lock whose grant is deferred until grantLock(), so the runtime can exit
    // while start() is suspended on the acquire, exactly the window the worker
    // transport already guards and the main transport must too.
    let grantLock!: () => void;
    let released = false;
    stub('navigator', {
      locks: {
        request: (
          name: string,
          _options: unknown,
          callback: (lock: unknown) => unknown,
        ) =>
          new Promise((resolveRequest) => {
            grantLock = () =>
              resolveRequest(
                Promise.resolve(callback({ name })).then(() => {
                  released = true;
                }),
              );
          }),
      },
    });
    // wavewalletdkCall stays installed after the runtime exits (Go leaves the
    // global in place), so the catch's function-probe cannot detect the death;
    // only the post-acquire runtimeExited guard releases the lock. A call would
    // reject against the dead runtime.
    stub('wavewalletdkCall', async () => {
      throw new Error('runtime exited during start');
    });
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);

    try {
      const client = new MainThreadWavelengthClient();
      const started = client
        .start({ network: 'regtest', arkServerAddress: 'h:7070' })
        .then(() => 'resolved', (err: unknown) => (err as { code?: string }).code);
      // Let the serialized start pass its pre-acquire checks and park on the
      // deferred acquire, then the runtime exits underneath it (bootExit sets
      // runtimeExited while this.lease is still the sentinel).
      await new Promise((resolve) => setTimeout(resolve, 0));
      (client as unknown as { runtimeExited: boolean }).runtimeExited = true;
      grantLock();

      assert.equal(await started, 'runtime_not_ready');
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(
        released,
        true,
        'a runtime that exits mid-acquire must not strand the origin lock',
      );
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  // grantingLocks stubs navigator.locks with a lock that is always available,
  // reporting when the holder lets it go.
  function grantingLocks() {
    const state = {
      released: false,
      requests: 0,
      names: [] as string[],
    };
    const locks = {
      request: (
        name: string,
        _options: unknown,
        callback: (lock: unknown) => unknown,
      ) => {
        state.requests += 1;
        state.names.push(name);

        return Promise.resolve(callback({ name })).then(() => {
          state.released = true;
        });
      },
    };

    return { state, navigator: { locks } };
  }

  // exclusiveLocks models Web Locks across multiple client instances. A name
  // remains held until the callback promise settles; a different name can be
  // granted concurrently.
  function exclusiveLocks() {
    const state = {
      held: new Set<string>(),
      requested: [] as string[],
    };
    const locks = {
      request: (
        name: string,
        _options: unknown,
        callback: (lock: unknown | null) => unknown,
      ) => {
        state.requested.push(name);
        if (state.held.has(name)) {
          return Promise.resolve(callback(null));
        }

        state.held.add(name);

        return Promise.resolve(callback({ name })).finally(() => {
          state.held.delete(name);
        });
      },
    };

    return { state, navigator: { locks } };
  }

  it('runs distinct external-seed profiles in separate workers concurrently', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const { RUNTIME_LOCK_NAME } = await import('../runtime-lock.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = exclusiveLocks();
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: AutoReplyWorker,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: locks.navigator,
    });

    const clients = [
      new WorkerWavelengthClient({ workerURL: 'account-0-worker.js' }),
      new WorkerWavelengthClient({ workerURL: 'account-1-worker.js' }),
      new WorkerWavelengthClient({ workerURL: 'duplicate-worker.js' }),
    ];
    const seedEntropy = new Uint8Array(16);

    try {
      await clients[0].startExternalSeedWallet(
        { network: 'signet', dataDir: '/wallets/account-0' },
        { seedEntropy },
      );
      await clients[1].startExternalSeedWallet(
        { network: 'signet', dataDir: '/wallets/account-1' },
        { seedEntropy },
      );
      assert.equal(locks.state.held.size, 2);
      assert.equal(locks.state.requested.includes(RUNTIME_LOCK_NAME), false);
      assert.notEqual(
        locks.state.requested[0],
        locks.state.requested[1],
        'separate profiles must not share a lock',
      );

      await assert.rejects(
        clients[2].startExternalSeedWallet(
          { network: 'signet', dataDir: '/wallets/other/../account-0/' },
          { seedEntropy },
        ),
        (err: unknown) => (err as { code?: string }).code === 'wallet_locked',
      );
      assert.equal(
        locks.state.requested[2],
        locks.state.requested[0],
        'equivalent profile paths must share a lock',
      );

      await Promise.all([clients[0].stop(), clients[1].stop()]);
      assert.equal(locks.state.held.size, 0);
    } finally {
      for (const client of clients) {
        client.dispose();
      }
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: savedNavigator,
      });
    }
  });

  it('holds the worker lock for an external-seed wallet until stop', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: AutoReplyWorker,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: locks.navigator,
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const seedEntropy = Uint8Array.from(
        { length: 16 },
        (_, index) => index,
      );
      await client.startExternalSeedWallet(
        { network: 'regtest', dataDir: '/wallets' },
        { seedEntropy },
      );
      const starts = FakeWorker.latest!.messages.filter(
        (message) => message.method === 'startExternalSeedWallet',
      );
      assert.equal(starts.length, 1);
      assert.deepEqual(starts[0].params, {
        config: {
          data_dir: '/wallets',
          network: 'regtest',
          server_transport: 'rest',
          wallet_type: 'lwwallet',
          swap_server_transport: 'rest',
        },
        seed_entropy: Buffer.from(seedEntropy).toString('base64'),
        expected_identity_pubkey: undefined,
        recover_state: undefined,
        recovery_window: undefined,
      });
      assert.equal(locks.state.released, false);

      await assert.rejects(
        client.startExternalSeedWallet(
          { network: 'regtest', dataDir: '/wallets' },
          { seedEntropy: new Uint8Array(16) },
        ),
        (err: unknown) => (err as { code?: string }).code === 'runtime_active',
      );
      assert.equal(
        FakeWorker.latest!.messages.filter(
          (message) => message.method === 'startExternalSeedWallet',
        ).length,
        1,
      );

      await client.stop();
      await Promise.resolve();
      assert.equal(locks.state.released, true);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: savedNavigator,
      });
    }
  });

  it('serializes and redacts main-thread external seed startup', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const { RUNTIME_LOCK_NAME } = await import('../runtime-lock.ts');
    const savedCall = (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    const savedLog = console.log;
    const locks = grantingLocks();
    const calls: Array<{ method: string; params: unknown }> = [];
    const logs: unknown[][] = [];
    Object.defineProperty(globalThis, 'wavewalletdkCall', {
      configurable: true,
      value: async (method: string, params: unknown) => {
        calls.push({ method, params });
        if (method === 'startExternalSeedWallet') {
          return {
            Imported: true,
            IdentityPubKey: 'identity',
          };
        }

        return null;
      },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: locks.navigator,
    });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });
    console.log = (...args: unknown[]) => logs.push(args);

    try {
      const client = new MainThreadWavelengthClient({ debug: true });
      const seedEntropy = Uint8Array.from(
        { length: 16 },
        (_, index) => index,
      );
      await client.startExternalSeedWallet(
        { network: 'regtest', dataDir: '/wallets' },
        { seedEntropy },
      );
      assert.equal(calls[0].method, 'startExternalSeedWallet');
      assert.deepEqual(locks.state.names, [RUNTIME_LOCK_NAME]);
      assert.equal(locks.state.released, false);
      await assert.rejects(
        client.startExternalSeedWallet(
          { network: 'regtest', dataDir: '/wallets' },
          { seedEntropy: new Uint8Array(16) },
        ),
      );

      const renderedLogs = JSON.stringify(logs);
      assert.equal(
        renderedLogs.includes(Buffer.from(seedEntropy).toString('base64')),
        false,
      );
      assert.match(renderedLogs, /"seed_entropy":"\[REDACTED\]"/);
      assert.match(renderedLogs, /"data_dir":"\/wallets"/);

      await client.stop();
      await Promise.resolve();
      assert.equal(locks.state.released, true);
      client.dispose();
    } finally {
      console.log = savedLog;
      Object.defineProperty(globalThis, 'wavewalletdkCall', {
        configurable: true,
        value: savedCall,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: savedNavigator,
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });

  // A worker whose every RPC fails, standing in for a daemon that cannot be
  // reached: neither start nor the stop that follows it is acknowledged.
  class RejectingWorker extends FakeWorker {
    postMessage(message: WorkerMessage): void {
      this.messages.push(message);
      if (typeof message.id === 'number') {
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              id: message.id,
              ok: false,
              error: 'dial ark server: connection refused',
            },
          } as MessageEvent),
        );
      }
    }
  }

  it('releases the lock and abandons the worker when a start fails', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    const created: RejectingWorker[] = [];
    class CountingRejectingWorker extends RejectingWorker {
      constructor(url: string | URL) {
        super(url);
        created.push(this);
      }
    }
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: CountingRejectingWorker,
    });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Terminating the worker frees the OPFS handles the start may have
      // opened, so the lock is handed straight back rather than held on the
      // chance a daemon survived. No graceful stop is attempted: the worker
      // is gone.
      assert.equal(locks.state.released, true);
      assert.ok(
        !FakeWorker.latest!.messages.some((m) => m.method === 'stop'),
        'a killed worker is not asked to stop',
      );

      // The retry runs on a fresh worker, not the abandoned one.
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
      );
      assert.equal(created.length, 2, 'a failed start abandons its worker');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('releases the runtime lock when the runtime never loaded', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();

    // The worker cannot fetch its runtime assets, so no daemon ever exists and
    // no database is ever opened.
    class AssetlessWorker extends FakeWorker {
      postMessage(message: WorkerMessage): void {
        this.messages.push(message);
        if (typeof message.id === 'number') {
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                id: message.id,
                ok: false,
                error:
                  'Wavelength runtime asset could not be loaded from https://x/wavewalletdk.wasm',
              },
            } as MessageEvent),
          );
        }
      }
    }

    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AssetlessWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, 'asset_load_failed');

          return true;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Holding here would lock the whole origin out of a wallet that never
      // started, for as long as this tab stays open.
      assert.equal(
        locks.state.released,
        true,
        'a runtime that never loaded cannot be holding a database',
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('never takes the runtime lock for a config that cannot start', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await assert.rejects(client.start({ network: 'mainnet' }), (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'invalid_config');

        return true;
      });

      assert.equal(
        locks.state.requests,
        0,
        'a request that cannot reach the daemon must not touch the lock',
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('releases the runtime lock before announcing a clean stop', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const order: string[] = [];
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AutoReplyWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            _name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) =>
            Promise.resolve(callback({ name: 'lock' })).then(() => {
              order.push('released');
            }),
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      client.subscribe((event) => {
        if (event.type === 'runtimeStopped') {
          order.push('runtimeStopped');
        }
      });
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      await client.stop();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // A subscriber that restarts the wallet on runtimeStopped must find the
      // lock already free, or its acquire races the release behind it.
      assert.deepEqual(order, ['released', 'runtimeStopped']);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('releases the lock and announces the stop when a main-thread runtime exits', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      navigator: (globalThis as { navigator?: unknown }).navigator,
      document: (globalThis as { document?: unknown }).document,
      Go: (globalThis as { Go?: unknown }).Go,
      fetch: globalThis.fetch,
      decompression: (globalThis as { DecompressionStream?: unknown })
        .DecompressionStream,
      instantiate: WebAssembly.instantiate,
      instantiateStreaming: WebAssembly.instantiateStreaming,
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const locks = grantingLocks();
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });

    // Stand up just enough of a browser for loadRuntime() to reach the point
    // where the Go runtime is running, then kill the runtime.
    let exitRuntime!: (reason: unknown) => void;
    const runPromise = new Promise((_resolve, reject) => {
      exitRuntime = reject;
    });
    stub('navigator', locks.navigator);
    stub('document', stubDocument());
    stub('Go', class {
      importObject = {};
      run() {
        return runPromise;
      }
    });
    // The loader identifies the asset by its magic number, so the stub has to
    // be a real Response with a body rather than a bag with an arrayBuffer().
    // Raw wasm magic plus no DecompressionStream forces the uncompressed
    // path, which buffers the response into an ArrayBuffer and instantiates
    // it directly against the stubbed WebAssembly.instantiate below;
    // runtimeIntegrity is disabled (see the client construction below) so the
    // stubbed placeholder bytes do not fail digest verification.
    stub('DecompressionStream', undefined);
    stub(
      'fetch',
      async () =>
        new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0])),
    );
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);
    stub('wavewalletdkCall', undefined);
    Object.defineProperty(WebAssembly, 'instantiate', {
      configurable: true,
      value: async () => ({ instance: {} }),
    });
    Object.defineProperty(WebAssembly, 'instantiateStreaming', {
      configurable: true,
      value: async () => ({ instance: {} }),
    });

    try {
      const client = new MainThreadWavelengthClient({
        runtimeBaseUrl: 'https://x/',
        // The stubbed fetch returns placeholder bytes, not the real runtime
        // asset content, so integrity verification is disabled: this test
        // exercises the runtime-exit path, not digest checking.
        runtimeIntegrity: false,
      });
      const events: string[] = [];
      client.subscribe((event) => events.push(event.type));

      // Reach ready by firing the runtime's own signal, then take the lock the
      // way a successful start would.
      const ready = client.ready();
      stub('wavewalletdkCall', () => Promise.resolve({}));
      const readyListeners: Array<() => void> = [];
      stub('addEventListener', (_type: string, fn: () => void) => readyListeners.push(fn));
      await Promise.resolve();
      readyListeners.forEach((fn) => fn());
      await ready.catch(() => undefined);
      // Take the lock the way a successful start() would, capturing its lease
      // into the client so the teardown release is scoped to this session.
      const internals = client as unknown as {
        lock: { acquire: () => Promise<number> };
        lease: number;
      };
      internals.lease = await internals.lock.acquire();

      // The Go runtime exits underneath the page.
      exitRuntime(new Error('runtime exited: database is locked'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(locks.state.released, true, 'a dead runtime holds nothing');
      assert.ok(
        events.includes('runtimeStopped'),
        'a host must learn the main-thread runtime died',
      );
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (name === 'instantiate' || name === 'instantiateStreaming') {
          Object.defineProperty(WebAssembly, name, {
            configurable: true,
            value,
          });
          continue;
        }
        Object.defineProperty(
          globalThis,
          name === 'decompression' ? 'DecompressionStream' : name === 'call' ? 'wavewalletdkCall' : name,
          { configurable: true, value },
        );
      }
    }
  });

  it('releases the main-thread lock when any bootstrap failure precedes the runtime', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      navigator: (globalThis as { navigator?: unknown }).navigator,
      document: (globalThis as { document?: unknown }).document,
      Go: (globalThis as { Go?: unknown }).Go,
      fetch: globalThis.fetch,
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const locks = grantingLocks();
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    locks.navigator satisfies object;
    stub('navigator', locks.navigator);
    // loadVerifiedScript executes each bootstrap script via a <script src>
    // pointed at a blob URL, "run" here by resolving onload on the next
    // microtask (same stubDocument as the runtime-exit test above); the
    // missing Go constructor then fails the boot with a bare, uncoded
    // WavelengthError, the shape that a code-classification release keeps
    // missing. The failure happens before instantiateWasm is ever reached,
    // so no wasm fetch or DecompressionStream stub is needed.
    stub('document', stubDocument());
    stub(
      'fetch',
      async () =>
        new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0])),
    );
    stub('Go', undefined);
    stub('wavewalletdkCall', undefined);
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);

    try {
      const client = new MainThreadWavelengthClient({
        runtimeBaseUrl: 'https://x/',
        // The stubbed fetch returns placeholder bytes, not the real runtime
        // asset content, so integrity verification is disabled: without this
        // the first bootstrap script fails its digest check and the test
        // never reaches the missing-Go path its comment describes.
        runtimeIntegrity: false,
      });
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The runtime never became callable, so nothing can be holding a
      // database; retaining would lock the origin out of a wallet that never
      // ran, for as long as this tab stays open.
      assert.equal(locks.state.released, true);
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('keeps the main-thread lock when the daemon is up and a recovery stop fails', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      navigator: (globalThis as { navigator?: unknown }).navigator,
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const locks = grantingLocks();
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    stub('navigator', locks.navigator);
    // The runtime is callable and its daemon rejects both the start and the
    // recovery stop: the daemon may still hold the databases, so the lock
    // must be retained and the retention traced in the log.
    stub('wavewalletdkCall', async () => {
      throw new Error('daemon rejected the call');
    });
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);

    try {
      const client = new MainThreadWavelengthClient();
      const errors: string[] = [];
      client.subscribe((event) => {
        if (event.type === 'log' && event.payload.level === 'error') {
          errors.push(event.payload.message);
        }
      });

      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(locks.state.released, false);
      assert.ok(
        errors.some((message) => /lock is retained/.test(message)),
        'the retained lock must leave an error-level trace for whoever debugs it',
      );
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('keeps the main-thread runtime lock when the client is disposed', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });

    try {
      const client = new MainThreadWavelengthClient();
      // Reach into the lock the way a successful start would, without booting
      // a wasm runtime this test has no way to provide.
      await (client as unknown as { lock: { acquire: () => Promise<void> } }).lock.acquire();
      client.dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // dispose() cannot terminate a main-thread Go runtime, so the daemon may
      // still own its databases; only the page going away proves otherwise.
      assert.equal(locks.state.released, false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });

  it('releases the main-thread lock when disposed wins the acquire before boot', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      navigator: (globalThis as { navigator?: unknown }).navigator,
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    // A lock whose grant is deferred until grantLock(), so dispose() can land
    // in the window between the top disposed-check passing and the acquire
    // resolving: exactly the post-acquire release path this test covers.
    let grantLock!: () => void;
    let released = false;
    stub('navigator', {
      locks: {
        request: (
          name: string,
          _options: unknown,
          callback: (lock: unknown) => unknown,
        ) =>
          new Promise((resolveRequest) => {
            grantLock = () =>
              resolveRequest(
                Promise.resolve(callback({ name })).then(() => {
                  released = true;
                }),
              );
          }),
      },
    });
    // The runtime is already callable (ready() loads it before start()
    // dispatches anything), yet super.start() never ran, so no database was
    // opened and the disposed bail must still hand the lock back rather than
    // retain it on the strength of the runtime being loaded.
    stub('wavewalletdkCall', () => Promise.resolve({}));
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);

    try {
      const client = new MainThreadWavelengthClient();
      const started = client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      // Let the serialized start pass its top disposed-check and park on the
      // deferred acquire, then dispose and release the grant so the bail lands
      // after acquire resolves.
      await new Promise((resolve) => setTimeout(resolve, 0));
      client.dispose();
      grantLock();

      await assert.rejects(started, (err: unknown) => {
        // A disposed main-thread client has no worker, so the code is the
        // generic 'wavelength_error', not the worker-transport 'worker_error'.
        assert.equal((err as { code?: string }).code, 'wavelength_error');

        return true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(
        released,
        true,
        'a start disposed before it booted anything must not strand the lock',
      );
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('rejects a start on an already-disposed main-thread client with wavelength_error', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);

    try {
      const client = new MainThreadWavelengthClient();
      client.dispose();
      // A disposed main-thread client has no worker, so the disposed guard
      // rejects with the generic 'wavelength_error', not the worker-transport
      // 'worker_error'.
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, 'wavelength_error');

          return true;
        },
      );
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name, value);
      }
    }
  });

  it('redacts wallet secrets from main-thread debug logs', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    const mnemonic = ['abandon', 'ability', 'able', 'about'];
    const results: Record<string, unknown> = {
      createWallet: {
        Mnemonic: mnemonic,
        EncipheredSeed: 'ZW5jaXBoZXJlZA==',
        IdentityPubKey: 'identity',
      },
      unlockWallet: { IdentityPubKey: 'identity' },
      openWalletFromPasskey: {
        Imported: true,
        Mnemonic: mnemonic,
        IdentityPubKey: 'identity',
      },
    };
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);
    stub('wavewalletdkCall', async (method: string) => results[method]);
    const savedLog = console.log;
    const logs: unknown[][] = [];
    console.log = (...args: unknown[]) => logs.push(args);

    try {
      const client = new MainThreadWavelengthClient({ debug: true });
      const created = await client.createWallet({
        password: 'wallet-password',
        mnemonic,
        seedPassphrase: 'seed-passphrase',
        recoverState: true,
      });
      await client.unlockWallet({ password: 'wallet-password' });
      await client.openWalletFromPasskey({ prfOutput: 'cd'.repeat(32) });
      assert.deepEqual(created.mnemonic, mnemonic);

      const rendered = JSON.stringify(logs);
      for (const secret of [
        Buffer.from('wallet-password').toString('base64'),
        Buffer.from('seed-passphrase').toString('base64'),
        'ZW5jaXBoZXJlZA==',
        'cd'.repeat(32),
        ...mnemonic,
      ]) {
        assert.equal(rendered.includes(secret), false, `leaked ${secret}`);
      }
      assert.equal(logs.length, 6);
      assert.match(rendered, /"RecoverState":true/);
      assert.match(rendered, /"IdentityPubKey":"identity"/);
      client.dispose();
    } finally {
      console.log = savedLog;
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('does not classify a non-start main-thread rejection as wallet_locked', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);
    stub('wavewalletdkCall', async () => {
      throw new Error('read wallet balance: database is locked');
    });

    try {
      const client = new MainThreadWavelengthClient();
      // A locked-database message on a non-start verb is same-runtime transient
      // contention, not another tab, so it must not map to wallet_locked and
      // send a sole tab hunting for a window that does not exist.
      await assert.rejects(client.callFacade('getInfo'), (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'wavelength_error');

        return true;
      });
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('warns when a main-thread storage failure does not classify as wallet_locked', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);
    stub('wavewalletdkCall', async () => {
      throw new Error('SQLITE_IOERR: disk I/O error on /waved.db');
    });
    const savedConsoleWarn = console.warn;
    const consoleWarns: string[] = [];
    console.warn = (...args: unknown[]) => {
      consoleWarns.push(String(args[0]));
    };

    try {
      const client = new MainThreadWavelengthClient();
      const warns: string[] = [];
      client.subscribe((event) => {
        if (event.type === 'log' && event.payload.level === 'warn') {
          warns.push(event.payload.message);
        }
      });

      await assert.rejects(client.callFacade('getInfo'), (err: unknown) => {
        assert.notEqual((err as { code?: string }).code, 'wallet_locked');

        return true;
      });
      assert.ok(
        warns.some((message) => /not classified as wallet_locked/.test(message)),
        'a near-miss storage failure must leave a drift warning',
      );
      // Both channels: the drift signal also reaches console.warn, so a bare
      // client with no log subscriber still surfaces the daemon-wording drift.
      assert.ok(
        consoleWarns.some((message) => /not classified as wallet_locked/.test(message)),
        'the drift warning must also reach console.warn for subscriber-less consumers',
      );
      client.dispose();
    } finally {
      console.warn = savedConsoleWarn;
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('fails a main-thread start after the runtime exited with runtime_not_ready', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);

    try {
      const client = new MainThreadWavelengthClient();
      // A main-thread Go runtime that exited cannot boot another in the page,
      // so a restart must fail fast rather than acquire a lock for a bridge
      // that answers nothing.
      (client as unknown as { runtimeExited: boolean }).runtimeExited = true;
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, 'runtime_not_ready');

          return true;
        },
      );
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name, value);
      }
    }
  });

  it('resolves a main-thread stop cleanly after the runtime exited', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const saved = {
      addEventListener: globalThis.addEventListener,
      removeEventListener: globalThis.removeEventListener,
      call: (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall,
    };
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    const calls: string[] = [];
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);
    // The bridge stays installed after the Go runtime exits, but a call to it
    // now fails. The stop guard must own the shutdown as satisfied rather than
    // reach the dead bridge, so stop() resolves instead of rejecting (or, in a
    // real browser, hanging).
    stub('wavewalletdkCall', async (method: string) => {
      calls.push(method);
      throw new Error('runtime exited');
    });

    try {
      const client = new MainThreadWavelengthClient();
      // The main-thread Go runtime has exited (bootExit sets this). Like the
      // worker transport, a stop() must resolve as satisfied.
      (client as unknown as { runtimeExited: boolean }).runtimeExited = true;
      await client.stop();
      assert.ok(
        !calls.includes('stop'),
        'a stop after the runtime exited must not call the dead bridge',
      );
      client.dispose();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        stub(name === 'call' ? 'wavewalletdkCall' : name, value);
      }
    }
  });

  it('does not classify a non-start worker rejection as wallet_locked', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      // A locked-database message on a non-start verb is same-runtime transient
      // contention, not another tab, so it must not map to wallet_locked.
      const inflight = client.callFacade('getInfo');
      const request = FakeWorker.latest!.messages.at(-1);
      FakeWorker.latest!.onmessage?.({
        data: {
          id: request?.id,
          ok: false,
          error: 'read wallet balance: database is locked',
        },
      } as MessageEvent);

      await assert.rejects(inflight, (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'wavelength_error');

        return true;
      });
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('classifies a locked-database worker start rejection as wallet_locked', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const started = client
        .start({ network: 'regtest', arkServerAddress: 'h:7070' })
        .then(
          () => 'resolved',
          (err: unknown) => (err as { code?: string }).code,
        );
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The start RPC failing on the locked database is genuine cross-context
      // contention (the no-Web-Locks race, or a browser without the API), so it
      // is the one verb the classifier still maps to wallet_locked.
      const startReq = FakeWorker.latest!.messages.find((m) => m.method === 'start');
      FakeWorker.latest!.onmessage?.({
        data: {
          id: startReq?.id,
          ok: false,
          error: 'open OPFS wallet database: database is locked',
        },
      } as MessageEvent);

      assert.equal(await started, 'wallet_locked');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('rejects an in-flight call and announces the stop when the runtime dies', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      // Both have to happen; their order does not matter, because the engine's
      // phase machine lets a start failure claim the phase back from the stop
      // it caused (see the engine's own coverage of that race).
      const events: string[] = [];
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      client.subscribe((event) => events.push(event.type));

      const inflight = client
        .start({ network: 'regtest', arkServerAddress: 'h:7070' })
        .catch((err: unknown) => (err as { code?: string }).code);

      // Let the serialized start run and post its 'start' RPC before the fatal
      // lands, so the death rejects the in-flight call rather than beating it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      FakeWorker.latest!.onmessage?.({
        data: {
          fatal: {
            message: 'embedded daemon exited: database is locked',
          },
        },
      } as MessageEvent);

      assert.equal(await inflight, 'wallet_locked');
      // runtimeStopped is announced only after releaseAndSettle settles, a turn
      // after the start rejection, so wait it out rather than racing the emit.
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.ok(events.includes('runtimeStopped'));
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('starts a fresh worker after the runtime exits, so a retry can succeed', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const created: AutoReplyWorker[] = [];
    class CountingWorker extends AutoReplyWorker {
      constructor(url: string | URL) {
        super(url);
        created.push(this);
      }
    }
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: CountingWorker });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      assert.equal(created.length, 1);

      // The runtime dies. Its Worker keeps terminal state (the Go program has
      // exited and will not reload), so retrying against it can never work.
      const first = created[0];
      first.onmessage?.({
        data: { fatal: { message: 'embedded daemon exited: database is locked' } },
      } as MessageEvent);

      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });

      assert.equal(created.length, 2, 'the retry must run on a new worker');
      assert.ok(
        created[1].messages.some((m) => (m as { $init?: unknown }).$init),
        'the replacement worker needs its own $init before any RPC',
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('does not resurrect a disposed client by spawning another worker', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const created: AutoReplyWorker[] = [];
    class CountingWorker extends AutoReplyWorker {
      constructor(url: string | URL) {
        super(url);
        created.push(this);
      }
    }
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: CountingWorker });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      client.dispose();

      // dispose() marks the runtime gone so the failed-start cleanup does not
      // wait on a terminated worker. That must not be mistaken for a runtime
      // that merely died, or a disposed client would quietly stand up a new
      // worker, take the cross-tab lock, and run a daemon nobody can stop.
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
      );
      assert.equal(created.length, 1, 'a disposed client must not spawn a worker');
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('releases the lock and announces the stop once when the worker errors', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const stops: string[] = [];
      client.subscribe((event) => {
        if (event.type === 'runtimeStopped') {
          stops.push('stop');
        }
      });
      const internals = client as unknown as {
        lock: { acquire: () => Promise<number> };
        lease: number;
      };
      internals.lease = await internals.lock.acquire();

      // A worker error and a fatal message can both land for one death; the
      // lock must release and the terminal event must fire exactly once.
      FakeWorker.latest!.onerror?.({ message: 'worker crashed' } as ErrorEvent);
      FakeWorker.latest!.onmessage?.({
        data: { fatal: { message: 'runtime gone' } },
      } as MessageEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(locks.state.released, true);
      assert.deepEqual(stops, ['stop'], 'runtimeStopped must not double-fire');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('rejects calls made after the runtime died instead of hanging them', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      FakeWorker.latest!.onmessage?.({
        data: { fatal: { message: 'runtime gone' } },
      } as MessageEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The worker is terminated; a call posted to it can never be answered,
      // so it must reject rather than register a promise that never settles.
      const outcome = await Promise.race([
        client.getInfo().then(
          () => 'resolved',
          () => 'rejected',
        ),
        new Promise((resolve) => setTimeout(() => resolve('hung'), 100)),
      ]);

      assert.equal(outcome, 'rejected');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('announces the stop on a failed start, like every other dead-runtime path', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: RejectingWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const stops: string[] = [];
      client.subscribe((event) => {
        if (event.type === 'runtimeStopped') {
          stops.push('stop');
        }
      });

      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      // A host keying runtime liveness off runtimeStopped must hear about a
      // start that killed its worker, exactly once. The engine still lands on
      // 'error', because its phase machine lets the failure outrank the stop.
      assert.deepEqual(stops, ['stop']);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('lands the engine on error when a fatal races a start, however slow the lock release', async () => {
    // The round-five regression, kept as the outcome-level guarantee: with a
    // release that settles asynchronously (like the real Web Locks API), the
    // stop announcement lands after the start rejection, and the host must
    // still end on the error, not a generic stopped screen.
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const { createWalletEngine } = await import('@lightninglabs/wavelength-core');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            _name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) =>
            Promise.resolve(callback({ name: 'lock' })).then(
              () => new Promise((resolve) => setTimeout(resolve, 20)),
            ),
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const engine = createWalletEngine({ client });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const started = engine
        .start({ network: 'regtest', arkServerAddress: 'h:7070' })
        .catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
      FakeWorker.latest!.onmessage?.({
        data: { fatal: { message: 'embedded daemon exited: database is locked' } },
      } as MessageEvent);
      await started;
      // Wait out the slow release and the deferred stop announcement.
      await new Promise((resolve) => setTimeout(resolve, 60));

      const snap = engine.getSnapshot();
      assert.equal(snap.phase, 'error');
      assert.equal(
        (snap.error as { code?: string } | null)?.code,
        'wallet_locked',
      );
      engine.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('ignores a stale worker error so it cannot tear down the replacement', async () => {
    // After a runtime death and a retry, a late error from the dead worker must
    // not terminate the fresh worker that replaced it.
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    const created: FakeWorker[] = [];
    class TrackingWorker extends AutoReplyWorker {
      constructor(url: string | URL) {
        super(url);
        created.push(this);
      }
    }
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TrackingWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      const dead = created[0];

      // The runtime dies, then the host retries onto a fresh worker.
      dead.onmessage?.({
        data: { fatal: { message: 'runtime gone' } },
      } as MessageEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      assert.equal(created.length, 2, 'the retry ran on a fresh worker');

      // A late error from the dead worker arrives after the replacement is live.
      dead.onerror?.({ message: 'late crash' } as ErrorEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The replacement must still answer: a stale error tore nothing down.
      const info = await client.callFacade('getInfo');
      assert.ok(info, 'the replacement worker survives the stale error');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('ignores a stale worker fatal so it cannot tear down the replacement', async () => {
    // A second fatal queued by the dead worker can be delivered after a retry
    // swapped in a replacement; it must not terminate the replacement. Mirrors
    // the onerror case, but through the onmessage/fatal path.
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();
    const created: FakeWorker[] = [];
    class TrackingWorker extends AutoReplyWorker {
      constructor(url: string | URL) {
        super(url);
        created.push(this);
      }
    }
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TrackingWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      const dead = created[0];

      dead.onmessage?.({
        data: { fatal: { message: 'runtime gone' } },
      } as MessageEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      assert.equal(created.length, 2, 'the retry ran on a fresh worker');

      // A second fatal from the dead worker arrives after the replacement is live.
      dead.onmessage?.({
        data: { fatal: { message: 'still gone' } },
      } as MessageEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const info = await client.callFacade('getInfo');
      assert.ok(info, 'the replacement worker survives the stale fatal');
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('lets an immediate retry after a fatal re-acquire instead of racing the release', async () => {
    // The runtime dies and the host retries at once, before the browser has
    // finished freeing the lock behind the teardown. The retry must wait that
    // release out and acquire, not see the lock still held and fail with a
    // spurious wallet_locked. Modeled with an ifAvailable lock that reports
    // contention (callback(null)) for any request issued while a release is
    // still settling, the way the real Web Locks API frees a turn late.
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const lockState = { held: false, contended: 0 };
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AutoReplyWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            _name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) => {
            if (lockState.held) {
              lockState.contended += 1;

              return Promise.resolve(callback(null));
            }
            lockState.held = true;

            return Promise.resolve(callback({ name: 'lock' })).then(
              () =>
                new Promise<void>((resolve) =>
                  setTimeout(() => {
                    lockState.held = false;
                    resolve();
                  }, 20),
                ),
            );
          },
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });

      // The runtime dies; killWorker releases, but the lock frees a turn later.
      FakeWorker.latest!.onmessage?.({
        data: { fatal: { message: 'runtime gone' } },
      } as MessageEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The retry issued inside that window must still resolve.
      const info = await client.start({
        network: 'regtest',
        arkServerAddress: 'h:7070',
      });
      assert.ok(info, 'the retry acquires once the release settles');
      assert.equal(
        lockState.contended,
        0,
        'the retry must not issue a request while the release is still settling',
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('a delayed stop from a dead runtime does not clobber the retry that replaced it', async () => {
    // After a fatal, the old worker's teardown announces runtimeStopped a turn
    // late (it awaits the lock release first). By then the host has retried and
    // a fresh runtime is starting; the stale stop must not knock that live
    // attempt onto the stopped screen. Outcome-level guarantee: the engine ends
    // on a started phase, not stopped.
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const { createWalletEngine } = await import('@lightninglabs/wavelength-core');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AutoReplyWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            _name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) =>
            Promise.resolve(callback({ name: 'lock' })).then(
              () => new Promise((resolve) => setTimeout(resolve, 20)),
            ),
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const engine = createWalletEngine({ client });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await engine.start({ network: 'regtest', arkServerAddress: 'h:7070' });

      // The runtime dies; its teardown will announce the stop a turn late.
      FakeWorker.latest!.onmessage?.({
        data: { fatal: { message: 'runtime gone' } },
      } as MessageEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Retry at once, while the old release is still settling.
      await engine
        .start({ network: 'regtest', arkServerAddress: 'h:7070' })
        .catch(() => undefined);
      // Wait out the old release and its deferred stop announcement.
      await new Promise((resolve) => setTimeout(resolve, 60));

      const snap = engine.getSnapshot();
      assert.notEqual(
        snap.phase,
        'stopped',
        'a stale stop must not clobber the live retry',
      );
      engine.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('surfaces a refused lock request as runtime_lock_unavailable through the transport', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AutoReplyWorker });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: () => Promise.reject(new Error('document is shutting down')),
        },
      },
    });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, 'runtime_lock_unavailable');

          return true;
        },
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('warns when a storage failure does not classify as wallet_locked', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    const savedConsoleWarn = console.warn;
    const consoleWarns: string[] = [];
    console.warn = (...args: unknown[]) => {
      consoleWarns.push(String(args[0]));
    };

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const warns: string[] = [];
      client.subscribe((event) => {
        if (event.type === 'log' && event.payload.level === 'warn') {
          warns.push(event.payload.message);
        }
      });

      const inflight = client.callFacade('getInfo');
      const request = FakeWorker.latest!.messages.at(-1);
      FakeWorker.latest!.onmessage?.({
        data: {
          id: request?.id,
          ok: false,
          error: 'SQLITE_IOERR: disk I/O error on /waved.db',
        },
      } as MessageEvent);

      await assert.rejects(inflight, (err: unknown) => {
        assert.notEqual((err as { code?: string }).code, 'wallet_locked');

        return true;
      });
      // The drift detector is the only signal that daemon rewording degraded
      // classification; it has to reach a level hosts actually surface.
      assert.ok(
        warns.some((message) => /not classified as wallet_locked/.test(message)),
      );
      // Both channels: also reaches console.warn, so a bare client with no log
      // subscriber still surfaces the drift.
      assert.ok(
        consoleWarns.some((message) => /not classified as wallet_locked/.test(message)),
        'the drift warning must also reach console.warn for subscriber-less consumers',
      );
      client.dispose();
    } finally {
      console.warn = savedConsoleWarn;
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('does not boot a worker daemon when disposed races the lock acquire', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    // No Web Locks: acquire() resolves immediately, so the only thing between
    // it and super.start() is a microtask, which is where a same-turn dispose()
    // lands.
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: AutoReplyWorker });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const started = client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
      client.dispose();

      await assert.rejects(started, (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'worker_error');

        return true;
      });
      assert.ok(
        !FakeWorker.latest!.messages.some((m) => m.method === 'start'),
        'a disposed start must not reach the worker',
      );
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  it('classifies a locked-database worker fatal as wallet_locked', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const inflight = client.callFacade('getInfo');
      FakeWorker.latest!.onmessage?.({
        data: {
          fatal: {
            message:
              'start embedded wallet: unable to open database: database is locked',
          },
        },
      } as MessageEvent);

      await assert.rejects(inflight, (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'wallet_locked');

        return true;
      });
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: savedWorker,
      });
    }
  });

  it('fails a main-thread start() fast with wallet_locked before loading the runtime', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (
            _name: string,
            _options: unknown,
            callback: (lock: unknown) => unknown,
          ) => Promise.resolve(callback(null)),
        },
      },
    });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });

    try {
      const client = new MainThreadWavelengthClient();
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, 'wallet_locked');

          return true;
        },
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: savedNavigator,
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });

  it('restarts after a pending main-thread activity open is stopped', async () => {
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const savedCall = (globalThis as { wavewalletdkCall?: unknown }).wavewalletdkCall;
    const savedAddEventListener = globalThis.addEventListener;
    const savedRemoveEventListener = globalThis.removeEventListener;
    const firstOpen = deferred<{ next: () => Promise<null>; close: () => void }>();
    const secondOpen = deferred<{ next: () => Promise<null>; close: () => void }>();
    let subscribeCalls = 0;
    let firstCloses = 0;
    let firstNextCalls = 0;
    let secondNextCalls = 0;
    Object.defineProperty(globalThis, 'wavewalletdkCall', {
      configurable: true,
      value: async () => {
        subscribeCalls += 1;
        return subscribeCalls === 1 ? firstOpen.promise : secondOpen.promise;
      },
    });
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: () => undefined,
    });

    try {
      const client = new MainThreadWavelengthClient();
      const firstStart = client.startActivity();
      await Promise.resolve();
      await Promise.resolve();
      client.stopActivity();
      const secondStart = client.startActivity();
      await Promise.resolve();

      assert.equal(subscribeCalls, 2);
      secondOpen.resolve({
        next: async () => {
          secondNextCalls += 1;
          return new Promise<null>(() => undefined);
        },
        close: () => undefined,
      });
      await secondStart;
      await Promise.resolve();

      assert.equal(secondNextCalls, 1);

      firstOpen.resolve({
        next: async () => {
          firstNextCalls += 1;
          return null;
        },
        close: () => {
          firstCloses += 1;
        },
      });
      await firstStart;
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(firstCloses, 1);
      assert.equal(firstNextCalls, 0);
      assert.equal(subscribeCalls, 2);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'wavewalletdkCall', {
        configurable: true,
        value: savedCall,
      });
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: savedAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: savedRemoveEventListener,
      });
    }
  });
});

describe('runtime integrity option', () => {
  // firstPostedMessage reads the $init message the WorkerWavelengthClient
  // constructor posts to the FakeWorker it just spawned; it is always the
  // first message on the latest instance.
  function firstPostedMessage(): WorkerMessage {
    return FakeWorker.latest!.messages[0];
  }

  afterEach(async () => {
    const { resetIntegrityDisabledWarning } = await import('../integrity.ts');
    resetIntegrityDisabledWarning();
    mock.restoreAll();
  });

  it('sends the pinned digest table in $init by default', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const { RUNTIME_ASSET_DIGESTS } = await import('../runtime-manifest.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      const init = firstPostedMessage() as {
        $init: { assetDigests: unknown };
      };
      assert.equal(init.$init.assetDigests, RUNTIME_ASSET_DIGESTS);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
    }
  });

  it('sends a null digest table and warns when integrity is disabled', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const warn = mock.method(console, 'warn', () => undefined);
      const client = new WorkerWavelengthClient({
        workerURL: 'fake-worker.js',
        runtimeIntegrity: false,
      });
      const init = firstPostedMessage() as {
        $init: { assetDigests: unknown };
      };
      assert.equal(init.$init.assetDigests, null);
      assert.equal(warn.mock.callCount(), 1);
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
    }
  });

  it('threads runtimeIntegrity through createWebWalletEngine', async () => {
    const { createWebWalletEngine } = await import('../index.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });

    try {
      const engine = createWebWalletEngine({
        workerURL: 'fake-worker.js',
        runtimeIntegrity: false,
      });
      const init = firstPostedMessage() as {
        $init: { assetDigests: unknown };
      };
      assert.equal(init.$init.assetDigests, null);
      engine.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
    }
  });

  it('classifies a worker integrity message as asset_integrity_failed', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
    const locks = grantingLocks();

    // The worker's fetched runtime bytes do not match the pinned digest, so no
    // daemon ever exists and no database is ever opened, exactly the shape of
    // the asset_load_failed worker never loaded above but with the integrity
    // phrasing instead.
    class IntegrityFailingWorker extends FakeWorker {
      postMessage(message: WorkerMessage): void {
        this.messages.push(message);
        if (typeof message.id === 'number') {
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                id: message.id,
                ok: false,
                error:
                  'Wavelength runtime asset at https://x/a.js failed integrity ' +
                  'verification (expected sha256-abc).',
              },
            } as MessageEvent),
          );
        }
      }
    }

    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: IntegrityFailingWorker,
    });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks.navigator });

    try {
      const client = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await assert.rejects(
        client.start({ network: 'regtest', arkServerAddress: 'h:7070' }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, 'asset_integrity_failed');

          return true;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Holding here would lock the whole origin out of a wallet that never
      // started, for as long as this tab stays open.
      assert.equal(
        locks.state.released,
        true,
        'a runtime that failed integrity verification cannot be holding a database',
      );
      client.dispose();
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: savedWorker });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
    }
  });

  // stubStartGlobals installs the globals both transports need to reach the
  // daemon: an auto-replying Worker, a granting lock, and a main-thread bridge
  // that records each facade method. The returned restore puts them back.
  function stubStartGlobals() {
    const names = [
      'Worker',
      'navigator',
      'addEventListener',
      'removeEventListener',
      'wavewalletdkCall',
    ];
    const saved = new Map(
      names.map((name) => [name, (globalThis as Record<string, unknown>)[name]]),
    );
    const stub = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, value });
    const locks = grantingLocks();
    const mainCalls: string[] = [];
    stub('Worker', AutoReplyWorker);
    stub('navigator', locks.navigator);
    stub('addEventListener', () => undefined);
    stub('removeEventListener', () => undefined);
    stub('wavewalletdkCall', async (method: string) => {
      mainCalls.push(method);

      return {};
    });

    return {
      locks,
      mainCalls,
      restore: () => {
        for (const [name, value] of saved) stub(name, value);
      },
    };
  }

  it('refuses a mainnet start with integrity disabled in both modes', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const { MainThreadWavelengthClient } = await import('./main.ts');
    mock.method(console, 'warn', () => undefined);
    const env = stubStartGlobals();
    const mainnet = { network: 'mainnet', allowMainnet: true } as const;
    const isInvalidConfig = (err: unknown) => {
      assert.equal((err as { code?: string }).code, 'invalid_config');
      assert.match((err as Error).message, /runtime integrity/);

      return true;
    };

    try {
      const worker = new WorkerWavelengthClient({
        workerURL: 'fake-worker.js',
        runtimeIntegrity: false,
      });
      const workerMessages = FakeWorker.latest!.messages;
      const main = new MainThreadWavelengthClient({ runtimeIntegrity: false });
      for (const client of [worker, main]) {
        await assert.rejects(client.start(mainnet), isInvalidConfig);
        await assert.rejects(
          client.startExternalSeedWallet(
            { ...mainnet, dataDir: '/wallets' },
            { seedEntropy: new Uint8Array(16) },
          ),
          isInvalidConfig,
        );
        client.dispose();
      }

      assert.equal(
        workerMessages.some((m) => m.method?.startsWith('start')),
        false,
      );
      assert.deepEqual(env.mainCalls, []);
      assert.equal(env.locks.state.requests, 0);
    } finally {
      env.restore();
    }
  });

  it('starts on testnet with integrity disabled and on mainnet with it on', async () => {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const { MainThreadWavelengthClient } = await import('./main.ts');
    const warn = mock.method(console, 'warn', () => undefined);
    const env = stubStartGlobals();
    const testnet = { network: 'testnet', arkServerAddress: 'h:7070' } as const;

    try {
      const worker = new WorkerWavelengthClient({
        workerURL: 'fake-worker.js',
        runtimeIntegrity: false,
      });
      await worker.start(testnet);
      assert.ok(FakeWorker.latest!.messages.some((m) => m.method === 'start'));
      await worker.stop();
      worker.dispose();

      const main = new MainThreadWavelengthClient({ runtimeIntegrity: false });
      await main.start(testnet);
      assert.ok(env.mainCalls.includes('start'));
      await main.stop();
      main.dispose();
      assert.equal(warn.mock.callCount(), 1);

      const verified = new WorkerWavelengthClient({ workerURL: 'fake-worker.js' });
      await verified.start({ network: 'mainnet', allowMainnet: true });
      assert.ok(FakeWorker.latest!.messages.some((m) => m.method === 'start'));
      await verified.stop();
      verified.dispose();
    } finally {
      env.restore();
    }
  });

  // grantingLocks stubs navigator.locks with a lock that is always available,
  // reporting when the holder lets it go. Duplicated from the activity
  // transport describe block above (that copy is module-private to it), so
  // this integrity classification test does not need to reach across blocks.
  function grantingLocks() {
    const state = { released: false, requests: 0 };
    const locks = {
      request: (
        _name: string,
        _options: unknown,
        callback: (lock: unknown) => unknown,
      ) => {
        state.requests += 1;

        return Promise.resolve(callback({ name: 'lock' })).then(() => {
          state.released = true;
        });
      },
    };

    return { state, navigator: { locks } };
  }
});

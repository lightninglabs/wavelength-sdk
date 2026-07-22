import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

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

type WorkerMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  $init?: unknown;
};

type RuntimeWorkerRequest = WorkerMessage & {
  id: number;
  method: string;
};

type RuntimeClient = {
  ready(): Promise<void>;
  start(config: { network?: 'signet' }): Promise<unknown>;
  isRunning(): Promise<boolean>;
  callFacade<T = unknown>(
    method: 'start' | 'stop',
    params?: unknown,
  ): Promise<T>;
  subscribe(listener: (event: unknown) => void): () => void;
  dispose(): void;
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

class RuntimeFakeWorker {
  static instances: RuntimeFakeWorker[] = [];
  readonly messages: WorkerMessage[] = [];
  readonly responded = new Set<number>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor(_url: string | URL) {
    RuntimeFakeWorker.instances.push(this);
  }

  postMessage(message: WorkerMessage): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  lifecycleRequests(): RuntimeWorkerRequest[] {
    return this.messages.filter(
      (message): message is RuntimeWorkerRequest =>
        typeof message.id === 'number' &&
        (message.method === 'start' || message.method === 'stop'),
    );
  }

  request(method: string): RuntimeWorkerRequest {
    const request = this.messages.find(
      (message): message is RuntimeWorkerRequest =>
        message.method === method &&
        typeof message.id === 'number' &&
        !this.responded.has(message.id),
    );
    assert.ok(request, `expected an unsettled ${method} worker request`);

    return request;
  }

  resolve(method: string, result?: unknown): void {
    const request = this.request(method);
    this.responded.add(request.id);
    this.onmessage?.({
      data: { id: request.id, ok: true, result },
    } as MessageEvent);
  }

  reject(method: string, error: string): void {
    const request = this.request(method);
    this.responded.add(request.id);
    this.onmessage?.({
      data: { id: request.id, ok: false, error },
    } as MessageEvent);
  }

  fatal(message: string): void {
    this.onmessage?.({ data: { fatal: { message } } } as MessageEvent);
  }
}

type LockRequest = {
  name: string;
  options: LockOptions;
};

class FakeLockManager {
  readonly requests: LockRequest[] = [];
  private held = false;
  private acquisitionGate: Promise<void> = Promise.resolve();

  get locked(): boolean {
    return this.held;
  }

  deferAcquisition(): () => void {
    const gate = deferred<void>();
    this.acquisitionGate = gate.promise;

    return () => gate.resolve();
  }

  request<T>(
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => T | PromiseLike<T>,
  ): Promise<T> {
    this.requests.push({ name, options });

    return (async () => {
      await this.acquisitionGate;
      if (this.held) {
        return callback(null);
      }

      this.held = true;
      try {
        return await callback({ name, mode: 'exclusive' } as Lock);
      } finally {
        this.held = false;
      }
    })();
  }
}

type RuntimeHarness = {
  createClient(): RuntimeClient;
  disposeClient(client: RuntimeClient): void;
};

function restoreGlobal(
  property: 'Worker' | 'navigator',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, property, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, property);
  }
}

async function flushMicrotasks(times = 12): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

async function withRuntimeHarness(
  lockManager: FakeLockManager | null,
  run: (harness: RuntimeHarness) => Promise<void>,
): Promise<void> {
  const savedWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const savedNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  const clients = new Set<RuntimeClient>();
  RuntimeFakeWorker.instances = [];
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: RuntimeFakeWorker,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: lockManager ? { locks: lockManager } : {},
  });

  try {
    const { WorkerWavelengthClient } = await import('./worker.ts');
    const createClient = (): RuntimeClient => {
      const client = new WorkerWavelengthClient({
        workerURL: 'fake-worker.js',
      }) as RuntimeClient;
      clients.add(client);

      return client;
    };
    await run({
      createClient,
      disposeClient: (client) => {
        client.dispose();
        clients.delete(client);
      },
    });
  } finally {
    for (const client of clients) {
      client.dispose();
    }
    restoreGlobal('Worker', savedWorker);
    restoreGlobal('navigator', savedNavigator);
    RuntimeFakeWorker.instances = [];
  }
}

describe('worker runtime lock', () => {
  it('rejects a second runtime before dispatching start', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const { WavelengthError } = await import(
        '@lightninglabs/wavelength-core'
      );
      const firstClient = createClient();
      const secondClient = createClient();
      const firstWorker = RuntimeFakeWorker.instances[0];
      const secondWorker = RuntimeFakeWorker.instances[1];

      const firstStart = firstClient.callFacade('start');
      await flushMicrotasks();
      assert.equal(firstWorker.request('start').method, 'start');
      assert.deepEqual(lockManager.requests[0], {
        name: 'lightninglabs:wavelength:worker-runtime',
        options: { mode: 'exclusive', ifAvailable: true },
      });
      firstWorker.resolve('start');
      await firstStart;

      await assert.rejects(
        () => secondClient.start({ network: 'signet' }),
        (err: unknown) => {
          assert.ok(err instanceof WavelengthError);
          assert.equal(err.code, 'runtime_locked');
          assert.equal(
            err.message,
            'This wallet is already open in another tab. Close the other tab and try again.',
          );

          return true;
        },
      );
      assert.equal(secondWorker.lifecycleRequests().length, 0);
    });
  });

  it('continues queued lifecycle work after a rejected start', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const client = createClient();
      const worker = RuntimeFakeWorker.instances[0];
      const firstStart = client.callFacade('start', { marker: 'first' });
      const secondStart = client.callFacade('start', { marker: 'second' });

      await flushMicrotasks();
      assert.deepEqual(
        worker.lifecycleRequests().map(({ method }) => method),
        ['start'],
      );
      worker.reject('start', 'start failed');
      await assert.rejects(() => firstStart, /start failed/);
      await flushMicrotasks();

      assert.deepEqual(
        worker.lifecycleRequests().map(({ method }) => method),
        ['start', 'start'],
      );
      assert.deepEqual(worker.lifecycleRequests()[1].params, {
        marker: 'second',
      });
      worker.resolve('start', 'second result');
      assert.equal(await secondStart, 'second result');
      assert.equal(lockManager.requests.length, 2);
      assert.equal(lockManager.locked, true);
    });
  });

  it('keeps an existing lock when a repeated start fails', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const firstClient = createClient();
      const firstWorker = RuntimeFakeWorker.instances[0];
      const firstStart = firstClient.callFacade('start');
      await flushMicrotasks();
      firstWorker.resolve('start');
      await firstStart;

      const repeatedStart = firstClient.callFacade('start');
      await flushMicrotasks();
      firstWorker.reject('start', 'already running');
      await assert.rejects(() => repeatedStart, /already running/);

      const secondClient = createClient();
      const secondWorker = RuntimeFakeWorker.instances[1];
      await assert.rejects(
        () => secondClient.callFacade('start'),
        (err: { code?: string }) => err.code === 'runtime_locked',
      );
      assert.equal(secondWorker.lifecycleRequests().length, 0);
    });
  });

  it('keeps the lock after a failed stop', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const firstClient = createClient();
      const firstWorker = RuntimeFakeWorker.instances[0];
      const firstStart = firstClient.callFacade('start');
      await flushMicrotasks();
      firstWorker.resolve('start');
      await firstStart;

      const stop = firstClient.callFacade('stop');
      await flushMicrotasks();
      firstWorker.reject('stop', 'stop failed');
      await assert.rejects(() => stop, /stop failed/);

      const secondClient = createClient();
      const secondWorker = RuntimeFakeWorker.instances[1];
      await assert.rejects(
        () => secondClient.callFacade('start'),
        (err: { code?: string }) => err.code === 'runtime_locked',
      );
      assert.equal(secondWorker.lifecycleRequests().length, 0);
    });
  });

  it('orders pending start, stop, and start calls exactly', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const firstClient = createClient();
      const firstWorker = RuntimeFakeWorker.instances[0];
      const startA = firstClient.callFacade('start', { marker: 'start A' });
      const stopB = firstClient.callFacade('stop', { marker: 'stop B' });
      const startC = firstClient.callFacade('start', { marker: 'start C' });
      assert.notEqual(startA, startC);

      await flushMicrotasks();
      assert.deepEqual(
        firstWorker.lifecycleRequests().map(({ method }) => method),
        ['start'],
      );
      assert.deepEqual(firstWorker.lifecycleRequests()[0].params, {
        marker: 'start A',
      });

      firstWorker.resolve('start', 'result A');
      assert.equal(await startA, 'result A');
      await flushMicrotasks();
      assert.deepEqual(
        firstWorker.lifecycleRequests().map(({ method }) => method),
        ['start', 'stop'],
      );

      firstWorker.resolve('stop', 'result B');
      assert.equal(await stopB, 'result B');
      await flushMicrotasks();
      assert.deepEqual(
        firstWorker.lifecycleRequests().map(({ method }) => method),
        ['start', 'stop', 'start'],
      );
      assert.deepEqual(firstWorker.lifecycleRequests()[2].params, {
        marker: 'start C',
      });

      firstWorker.resolve('start', 'result C');
      assert.equal(await startC, 'result C');
      assert.equal(lockManager.requests.length, 2);

      const secondClient = createClient();
      const secondWorker = RuntimeFakeWorker.instances[1];
      await assert.rejects(
        () => secondClient.callFacade('start'),
        (err: { code?: string }) => err.code === 'runtime_locked',
      );
      assert.equal(secondWorker.lifecycleRequests().length, 0);
    });
  });

  it('orders pending stop, start, and stop calls exactly', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const firstClient = createClient();
      const firstWorker = RuntimeFakeWorker.instances[0];
      const initialStart = firstClient.callFacade('start');
      await flushMicrotasks();
      firstWorker.resolve('start');
      await initialStart;

      const requestOffset = firstWorker.lifecycleRequests().length;
      const stopA = firstClient.callFacade('stop', { marker: 'stop A' });
      const startB = firstClient.callFacade('start', { marker: 'start B' });
      const stopC = firstClient.callFacade('stop', { marker: 'stop C' });
      assert.notEqual(stopA, stopC);

      await flushMicrotasks();
      assert.deepEqual(
        firstWorker
          .lifecycleRequests()
          .slice(requestOffset)
          .map(({ method }) => method),
        ['stop'],
      );

      firstWorker.resolve('stop', 'result A');
      assert.equal(await stopA, 'result A');
      await flushMicrotasks();
      assert.deepEqual(
        firstWorker
          .lifecycleRequests()
          .slice(requestOffset)
          .map(({ method }) => method),
        ['stop', 'start'],
      );

      firstWorker.resolve('start', 'result B');
      assert.equal(await startB, 'result B');
      await flushMicrotasks();
      assert.deepEqual(
        firstWorker
          .lifecycleRequests()
          .slice(requestOffset)
          .map(({ method }) => method),
        ['stop', 'start', 'stop'],
      );

      firstWorker.resolve('stop', 'result C');
      assert.equal(await stopC, 'result C');
      assert.equal(lockManager.locked, false);

      const secondClient = createClient();
      const secondWorker = RuntimeFakeWorker.instances[1];
      const secondStart = secondClient.callFacade('start');
      await flushMicrotasks();
      assert.equal(secondWorker.request('start').method, 'start');
      secondWorker.resolve('start');
      await secondStart;
    });
  });

  it('releases the lock and terminates the worker on dispose', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(
      lockManager,
      async ({ createClient, disposeClient }) => {
        const firstClient = createClient();
        const firstWorker = RuntimeFakeWorker.instances[0];
        const firstStart = firstClient.callFacade('start');
        await flushMicrotasks();
        firstWorker.resolve('start');
        await firstStart;

        disposeClient(firstClient);
        assert.equal(firstWorker.terminated, true);
        await flushMicrotasks();
        assert.equal(lockManager.locked, false);

        const secondClient = createClient();
        const secondWorker = RuntimeFakeWorker.instances[1];
        const secondStart = secondClient.callFacade('start');
        await flushMicrotasks();
        assert.equal(secondWorker.request('start').method, 'start');
        secondWorker.resolve('start');
        await secondStart;
      },
    );
  });

  it('disposes safely while Web Lock acquisition is pending', async () => {
    const lockManager = new FakeLockManager();
    const continueAcquisition = lockManager.deferAcquisition();
    await withRuntimeHarness(
      lockManager,
      async ({ createClient, disposeClient }) => {
        const firstClient = createClient();
        const firstWorker = RuntimeFakeWorker.instances[0];
        const firstStart = firstClient.callFacade('start');
        await flushMicrotasks();
        assert.equal(lockManager.requests.length, 1);
        assert.equal(firstWorker.lifecycleRequests().length, 0);

        disposeClient(firstClient);
        assert.equal(firstWorker.terminated, true);
        await assert.rejects(
          () => firstStart,
          (err: { code?: string; message?: string }) =>
            err.code === 'worker_error' &&
            err.message === 'Wavelength client disposed',
        );

        continueAcquisition();
        await flushMicrotasks();
        assert.equal(firstWorker.lifecycleRequests().length, 0);
        assert.equal(lockManager.locked, false);

        const secondClient = createClient();
        const secondWorker = RuntimeFakeWorker.instances[1];
        const secondStart = secondClient.callFacade('start');
        await flushMicrotasks();
        assert.equal(secondWorker.request('start').method, 'start');
        secondWorker.resolve('start');
        await secondStart;
      },
    );
  });

  it('releases the lock after a fatal runtime exit', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const firstClient = createClient();
      const firstWorker = RuntimeFakeWorker.instances[0];
      const events: unknown[] = [];
      firstClient.subscribe((event) => events.push(event));
      const firstStart = firstClient.callFacade('start');
      await flushMicrotasks();
      firstWorker.resolve('start');
      await firstStart;

      firstWorker.fatal('runtime exited');
      const secondClient = createClient();
      const secondWorker = RuntimeFakeWorker.instances[1];
      const secondStart = secondClient.callFacade('start');
      await flushMicrotasks();
      assert.deepEqual(events.at(-1), { type: 'runtimeStopped' });
      assert.equal(secondWorker.request('start').method, 'start');
      secondWorker.resolve('start');
      await secondStart;
    });
  });

  it('keeps the lock when post-start getInfo fails', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const firstClient = createClient();
      const firstWorker = RuntimeFakeWorker.instances[0];
      const start = firstClient.start({ network: 'signet' });
      await flushMicrotasks();
      firstWorker.resolve('start');
      await flushMicrotasks();
      firstWorker.reject('getInfo', 'getInfo failed');
      await assert.rejects(() => start, /getInfo failed/);

      const secondClient = createClient();
      const secondWorker = RuntimeFakeWorker.instances[1];
      await assert.rejects(
        () => secondClient.callFacade('start'),
        (err: { code?: string }) => err.code === 'runtime_locked',
      );
      assert.equal(secondWorker.lifecycleRequests().length, 0);
    });
  });

  it('does not lock ready or unrelated facade requests', async () => {
    const lockManager = new FakeLockManager();
    await withRuntimeHarness(lockManager, async ({ createClient }) => {
      const client = createClient();
      const worker = RuntimeFakeWorker.instances[0];

      const ready = client.ready();
      worker.resolve('$ready');
      await ready;
      const isRunning = client.isRunning();
      worker.resolve('isRunning', true);
      assert.equal(await isRunning, true);
      assert.equal(lockManager.requests.length, 0);
    });
  });

  it('preserves worker behavior when Web Locks are unavailable', async () => {
    await withRuntimeHarness(null, async ({ createClient }) => {
      const client = createClient();
      const worker = RuntimeFakeWorker.instances[0];
      const start = client.callFacade('start');
      await flushMicrotasks();
      assert.equal(worker.request('start').method, 'start');
      worker.resolve('start');
      await start;
    });
  });
});

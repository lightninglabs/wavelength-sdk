import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

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
});

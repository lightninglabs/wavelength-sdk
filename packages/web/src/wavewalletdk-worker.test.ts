import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import vm from 'node:vm';

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('wavewalletdk worker activity lifecycle', () => {
  it('coalesces concurrent activity opens into one subscription', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const listeners = new Map<string, Array<() => void>>();
    const opened = deferred<{ next: () => Promise<null>; close: () => void }>();
    let subscribeCalls = 0;
    const self: Record<string, unknown> = {
      postMessage: () => undefined,
      addEventListener: (name: string, listener: () => void) => {
        const current = listeners.get(name) ?? [];
        current.push(listener);
        listeners.set(name, current);
      },
      wavewalletdkCall: async (method: string) => {
        assert.equal(method, 'subscribe');
        subscribeCalls += 1;
        return opened.promise;
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
    const first = onmessage({ data: { id: 1, method: '$startActivity' } });
    const second = onmessage({ data: { id: 2, method: '$startActivity' } });
    await flush();

    assert.equal(subscribeCalls, 1);
    opened.resolve({
      next: () => new Promise<null>(() => undefined),
      close: () => undefined,
    });
    await Promise.all([first, second]);
  });
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

  it('closes a pending activity open when stopped', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const listeners = new Map<string, Array<() => void>>();
    const opened = deferred<{ next: () => Promise<null>; close: () => void }>();
    let closes = 0;
    let nextCalls = 0;
    const self: Record<string, unknown> = {
      postMessage: () => undefined,
      addEventListener: (name: string, listener: () => void) => {
        const current = listeners.get(name) ?? [];
        current.push(listener);
        listeners.set(name, current);
      },
      wavewalletdkCall: async () => opened.promise,
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
    const start = onmessage({ data: { id: 1, method: '$startActivity' } });
    await flush();
    await onmessage({ data: { id: 2, method: '$stopActivity' } });
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
    await flush();

    assert.equal(closes, 1);
    assert.equal(nextCalls, 0);
  });

  it('restarts after a pending activity open is stopped', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const listeners = new Map<string, Array<() => void>>();
    const firstOpen = deferred<{ next: () => Promise<null>; close: () => void }>();
    const secondOpen = deferred<{ next: () => Promise<null>; close: () => void }>();
    let subscribeCalls = 0;
    let firstCloses = 0;
    let firstNextCalls = 0;
    let secondNextCalls = 0;
    const self: Record<string, unknown> = {
      postMessage: () => undefined,
      addEventListener: (name: string, listener: () => void) => {
        const current = listeners.get(name) ?? [];
        current.push(listener);
        listeners.set(name, current);
      },
      wavewalletdkCall: async () => {
        subscribeCalls += 1;
        return subscribeCalls === 1 ? firstOpen.promise : secondOpen.promise;
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
    const firstStart = onmessage({ data: { id: 1, method: '$startActivity' } });
    await flush();
    await onmessage({ data: { id: 2, method: '$stopActivity' } });
    const secondStart = onmessage({ data: { id: 3, method: '$startActivity' } });
    await flush();

    assert.equal(subscribeCalls, 2);
    secondOpen.resolve({
      next: async () => {
        secondNextCalls += 1;
        return new Promise<null>(() => undefined);
      },
      close: () => undefined,
    });
    await secondStart;
    await flush();

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
    await flush();

    assert.equal(firstCloses, 1);
    assert.equal(firstNextCalls, 0);
    assert.equal(subscribeCalls, 2);
    await onmessage({ data: { id: 4, method: '$stopActivity' } });
  });
});

describe('wavewalletdk worker external-seed redaction', () => {
  it('never writes external-seed request or result secrets to debug logs', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const listeners = new Map<string, Array<() => void>>();
    const logs: unknown[][] = [];
    const self: Record<string, unknown> = {
      postMessage: () => undefined,
      addEventListener: (name: string, listener: () => void) => {
        const current = listeners.get(name) ?? [];
        current.push(listener);
        listeners.set(name, current);
      },
      wavewalletdkCall: async () => ({
        Imported: true,
        IdentityPubKey: 'identity',
      }),
    };
    vm.runInNewContext(source, {
      self,
      console: { ...console, log: (...args: unknown[]) => logs.push(args) },
      URL,
      Event: class Event {},
      setTimeout,
      clearTimeout,
    });

    const onmessage = self.onmessage as (event: unknown) => Promise<void>;
    await onmessage({ data: { $init: { debug: true } } });
    for (const listener of listeners.get('wavewalletdk-ready') ?? []) listener();
    await onmessage({
      data: {
        id: 1,
        method: 'startExternalSeedWallet',
        params: {
          seed_entropy: 'AAECAwQFBgcICQoLDA0ODw==',
        },
      },
    });

    const renderedLogs = JSON.stringify(logs);
    assert.equal(renderedLogs.includes('AAECAwQFBgcICQoLDA0ODw=='), false);
    assert.match(renderedLogs, /REDACTED external-seed wallet payload/);
  });
});

describe('wavewalletdk worker runtime cache option', () => {
  async function loadWorker() {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    let opens = 0;
    const deletes: string[] = [];
    const self: Record<string, unknown> = {
      postMessage: () => undefined,
      addEventListener: () => undefined,
      caches: {
        open: async () => {
          opens += 1;
          return {};
        },
        keys: async () => ['wavelength-runtime-v1-old'],
        delete: async (name: string) => {
          deletes.push(name);
          return true;
        },
      },
    };
    const context: Record<string, unknown> = {
      self,
      console,
      URL,
      Event: class Event {},
      setTimeout,
      clearTimeout,
    };
    vm.runInNewContext(source, context);

    return {
      context,
      onmessage: self.onmessage as (event: unknown) => Promise<void>,
      opens: () => opens,
      deletes: () => deletes,
    };
  }

  it('never opens the bucket when the client disables the cache', async () => {
    const w = await loadWorker();
    await w.onmessage({
      data: { $init: { runtimeVersion: 'v1.2.3', runtimeCache: false } },
    });

    const openRuntimeCache = w.context.openRuntimeCache as () => Promise<unknown>;
    assert.equal(await openRuntimeCache(), undefined);
    // Not opening is what keeps an existing bucket untouched: the superseded
    // sweep runs from inside open, so declining to open declines to prune.
    assert.equal(w.opens(), 0);
    assert.deepEqual(w.deletes(), []);
  });

  it('caches when $init omits the flag, so an older client keeps working', async () => {
    const w = await loadWorker();
    await w.onmessage({ data: { $init: { runtimeVersion: 'v1.2.3' } } });

    const openRuntimeCache = w.context.openRuntimeCache as () => Promise<unknown>;
    assert.ok(await openRuntimeCache());
    assert.equal(w.opens(), 1);
  });
});

describe('wavewalletdk worker asset integrity', () => {
  const BRIDGE = new Uint8Array([1, 2, 3, 4]);
  const EXEC = new Uint8Array([5, 6, 7, 8]);
  // Must start with the real wasm magic number: instantiateRuntimeAsset
  // sniffs the first four bytes to tell gzip from raw wasm before trusting
  // the body, so an arbitrary placeholder is rejected before it ever reaches
  // the (stubbed) WebAssembly.instantiate.
  const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

  function sri(bytes: Uint8Array): string {
    return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
  }

  // Objects posted from inside vm.runInNewContext belong to a different V8
  // realm, so their prototypes differ from this file's Object.prototype and
  // assert/strict's deepEqual (which checks prototype identity) reports them
  // as unequal even when every field matches. Round-tripping through JSON
  // normalizes the value into this realm's plain-object prototype before
  // comparing.
  function fromRealm(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
  }

  async function pollUntil(
    predicate: () => boolean,
    timeoutMs = 1000,
  ): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        assert.fail('timed out waiting for condition');
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  type Harness = {
    posted: unknown[];
    fetched: string[];
    imported: string[];
    onmessage: (event: unknown) => Promise<void>;
    fireReady: () => void;
  };

  function bootLoadingWorker(
    source: string,
    assets: Record<string, Uint8Array>,
    rejectAssets: Set<string> = new Set(),
    cryptoOverride: unknown = crypto,
    contextURL?: string,
  ): Harness {
    const listeners = new Map<string, Array<() => void>>();
    const posted: unknown[] = [];
    const fetched: string[] = [];
    const imported: string[] = [];
    const self: Record<string, unknown> = {
      ...(contextURL ? { location: { href: contextURL } } : {}),
      postMessage: (m: unknown) => posted.push(m),
      addEventListener: (name: string, listener: () => void) => {
        const current = listeners.get(name) ?? [];
        current.push(listener);
        listeners.set(name, current);
      },
    };
    const context: Record<string, unknown> = {
      self,
      console,
      URL,
      Blob,
      Response,
      Event,
      btoa,
      crypto: cryptoOverride,
      WebAssembly: {
        instantiate: async () => ({ instance: {} }),
      },
      fetch: async (url: string) => {
        fetched.push(url);
        const name = url.split('/').pop() ?? '';
        // Simulates a network or CORS failure, where fetch() itself rejects
        // rather than resolving with a non-ok response.
        if (rejectAssets.has(name)) {
          throw new TypeError('Failed to fetch');
        }
        const body = assets[name];
        return body
          ? new Response(new Uint8Array(body))
          : new Response(null, { status: 404 });
      },
      importScripts: (url: string) => {
        imported.push(url);
        // Loading wasm_exec.js is what defines Go; the stub mirrors that.
        context.Go = class {
          importObject = {};
          run() {
            return new Promise(() => undefined);
          }
        };
      },
      setTimeout,
      clearTimeout,
    };
    // DecompressionStream is deliberately absent, and these tests only stage
    // the raw wasm asset, so the compressed fetch 404s and the worker falls
    // back to the raw path; the compressed path's no-fallback-on-integrity-
    // mismatch rule is covered on the main thread, where the shared TS
    // implementation is directly testable.
    vm.runInNewContext(source, context);
    return {
      posted,
      fetched,
      imported,
      onmessage: self.onmessage as (event: unknown) => Promise<void>,
      fireReady: () => {
        for (const l of listeners.get('wavewalletdk-ready') ?? []) l();
      },
    };
  }

  it('verifies scripts and wasm and boots when digests match', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const assets = {
      'sqlite-bridge.js': BRIDGE,
      'wasm_exec.js': EXEC,
      'wavewalletdk.wasm': WASM,
    };
    const h = bootLoadingWorker(source, assets);
    h.onmessage({
      data: {
        $init: {
          runtimeBaseUrl: 'https://x/',
          debug: false,
          assetDigests: {
            'sqlite-bridge.js': sri(BRIDGE),
            'wasm_exec.js': sri(EXEC),
            'wavewalletdk.wasm': sri(WASM),
          },
        },
      },
    });
    const call = h.onmessage({ data: { id: 1, method: '$ready' } });
    // Loading is async; give the fetch/verify chain time to reach
    // waitForWASMReady, then release it.
    await pollUntil(() => h.imported.length === 2);
    h.fireReady();
    await call;

    assert.deepEqual(
      fromRealm(h.posted.find((m) => (m as { id?: number }).id === 1)),
      { id: 1, ok: true, result: { ready: true } },
    );
    // Scripts executed from blob URLs, not from the network URL.
    assert.ok(h.imported.every((u) => u.startsWith('blob:')));
    assert.deepEqual(h.fetched, [
      'https://x/sqlite-bridge.js',
      'https://x/wasm_exec.js',
      // instantiateWasm always tries the compressed asset first regardless of
      // DecompressionStream support (that check now lives inside
      // instantiateRuntimeAsset, after the fetch); it 404s here since the
      // test only stages the raw asset, and the loader falls back.
      'https://x/wavewalletdk.wasm.gz',
      'https://x/wavewalletdk.wasm',
    ]);
  });

  for (const base of ['https://assets.example/', 'chrome-extension://bbbbbbbb/']) {
    it(`keeps blob imports for assets outside its extension: ${base}`, async () => {
      const source = await readFile(new URL('./wavewalletdk-worker.js', import.meta.url), 'utf8');
      const assets = { 'sqlite-bridge.js': BRIDGE, 'wasm_exec.js': EXEC, 'wavewalletdk.wasm': WASM };
      const h = bootLoadingWorker(source, assets, new Set(), crypto, 'chrome-extension://aaaaaaaa/worker.js');
      await h.onmessage({ data: { $init: {
        runtimeBaseUrl: base,
        assetDigests: Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, sri(bytes)])),
      } } });
      const call = h.onmessage({ data: { id: 1, method: '$ready' } });
      await pollUntil(() => h.imported.length === 2);
      h.fireReady();
      await call;
      assert.ok(h.imported.every(url => url.startsWith('blob:')));
      assert.deepEqual(fromRealm(h.posted.find(m => (m as { id?: number }).id === 1)),
        { id: 1, ok: true, result: { ready: true } });
    });
  }

  it('names the network reason in the warning when the compressed wasm fetch rejects', async () => {
    // The gzip fallback logs err.cause so an operator can tell a DNS or CORS
    // failure from a plain 404. A fetch rejection is the only failure that
    // carries that reason, so dropping the cause at the fetch catch would
    // leave the one case the detail exists for permanently blank.
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const h = bootLoadingWorker(
      source,
      {
        'sqlite-bridge.js': BRIDGE,
        'wasm_exec.js': EXEC,
        'wavewalletdk.wasm': WASM,
      },
      new Set(['wavewalletdk.wasm.gz']),
    );
    h.onmessage({
      data: {
        $init: { runtimeBaseUrl: 'https://x/', debug: false, assetDigests: null },
      },
    });
    const call = h.onmessage({ data: { id: 1, method: '$ready' } });
    await pollUntil(() => h.imported.length === 2);
    h.fireReady();
    await call;

    const warning = h.posted.find(
      (m) =>
        (m as { event?: { type?: string; payload?: { message?: string } } })
          .event?.payload?.message?.startsWith('compressed wasm load failed'),
    ) as { event: { payload: { message: string } } } | undefined;
    assert.ok(warning, 'expected a compressed-wasm warning');
    assert.match(warning.event.payload.message, /Failed to fetch/);
    // The raw fallback still succeeded, so the warning is diagnostic only.
    assert.deepEqual(
      fromRealm(h.posted.find((m) => (m as { id?: number }).id === 1)),
      { id: 1, ok: true, result: { ready: true } },
    );
  });

  it('rejects a tampered script with an integrity message and executes nothing', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const h = bootLoadingWorker(source, { 'sqlite-bridge.js': BRIDGE });
    h.onmessage({
      data: {
        $init: {
          runtimeBaseUrl: 'https://x/',
          debug: false,
          assetDigests: { 'sqlite-bridge.js': sri(EXEC) },
        },
      },
    });
    await h.onmessage({ data: { id: 1, method: '$ready' } });

    const reply = h.posted.find((m) => (m as { id?: number }).id === 1) as {
      ok: boolean;
      error: string;
    };
    assert.equal(reply.ok, false);
    assert.match(reply.error, /failed integrity verification/);
    assert.deepEqual(h.imported, []);
  });

  it('converts a network or CORS fetch rejection to the load-failed message', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const h = bootLoadingWorker(
      source,
      {},
      new Set(['sqlite-bridge.js']),
    );
    h.onmessage({
      data: {
        $init: {
          runtimeBaseUrl: 'https://x/',
          debug: false,
          assetDigests: null,
        },
      },
    });
    await h.onmessage({ data: { id: 1, method: '$ready' } });

    const reply = h.posted.find((m) => (m as { id?: number }).id === 1) as {
      ok: boolean;
      error: string;
    };
    assert.equal(reply.ok, false);
    assert.match(reply.error, /runtime asset could not be loaded/);
    assert.deepEqual(h.imported, []);
  });

  it('reports a missing crypto.subtle with an actionable message, not a raw TypeError', async () => {
    // Worker mode does not require a secure context the way OPFS persistence
    // does, so a plain-HTTP host reaches sha256Sri with no crypto.subtle.
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const h = bootLoadingWorker(
      source,
      { 'sqlite-bridge.js': BRIDGE },
      new Set(),
      {},
    );
    h.onmessage({
      data: {
        $init: {
          runtimeBaseUrl: 'https://x/',
          debug: false,
          assetDigests: { 'sqlite-bridge.js': sri(BRIDGE) },
        },
      },
    });
    await h.onmessage({ data: { id: 1, method: '$ready' } });

    const reply = h.posted.find((m) => (m as { id?: number }).id === 1) as {
      ok: boolean;
      error: string;
    };
    assert.equal(reply.ok, false);
    assert.match(reply.error, /requires crypto\.subtle/);
    assert.deepEqual(h.imported, []);
  });

  it('loads without hashing when the digest table is null', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const assets = {
      'sqlite-bridge.js': BRIDGE,
      'wasm_exec.js': EXEC,
      'wavewalletdk.wasm': WASM,
    };
    const h = bootLoadingWorker(source, assets);
    h.onmessage({
      data: {
        $init: {
          runtimeBaseUrl: 'https://x/',
          debug: false,
          assetDigests: null,
        },
      },
    });
    const call = h.onmessage({ data: { id: 1, method: '$ready' } });
    // Loading is async; give the fetch/verify chain time to reach
    // waitForWASMReady, then release it.
    await pollUntil(() => h.imported.length === 2);
    h.fireReady();
    await call;

    assert.deepEqual(
      fromRealm(h.posted.find((m) => (m as { id?: number }).id === 1)),
      { id: 1, ok: true, result: { ready: true } },
    );
    assert.ok(h.imported.every((u) => u.startsWith('blob:')));
    assert.deepEqual(h.fetched, [
      'https://x/sqlite-bridge.js',
      'https://x/wasm_exec.js',
      // instantiateWasm always tries the compressed asset first regardless of
      // DecompressionStream support (that check now lives inside
      // instantiateRuntimeAsset, after the fetch); it 404s here since the
      // test only stages the raw asset, and the loader falls back.
      'https://x/wavewalletdk.wasm.gz',
      'https://x/wavewalletdk.wasm',
    ]);
  });
});

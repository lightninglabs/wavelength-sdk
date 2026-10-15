import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, it, mock } from 'node:test';
import type { WavelengthPerformanceEvent } from '@lightninglabs/wavelength-core';
import { WavelengthError } from '@lightninglabs/wavelength-core';
import {
  instantiateRuntimeAsset,
  instantiateWasm,
  loadVerifiedScript,
} from './runtime.ts';
import { sha256Sri } from './integrity.ts';

// Node's undici HTTP implementation lazily instantiates an internal parser
// wasm module the first time DecompressionStream/Response/WebAssembly.instantiate
// machinery actually runs, and that lazy load can resolve on a later tick,
// straggling into whichever test's stub happens to be active when it
// settles and inflating that test's call count. Warming the same pipeline up
// once here, with the real globals, before any test replaces them, keeps
// that one-time cost out of the suite entirely.
await new Response(
  new Response(
    gzipSync(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])),
  ).body!.pipeThrough(new DecompressionStream('gzip')),
)
  .arrayBuffer()
  .then((bytes) => WebAssembly.instantiate(bytes, {}));

const savedFetch = globalThis.fetch;
const savedCaches = (globalThis as { caches?: unknown }).caches;
const savedInstantiate = WebAssembly.instantiate;
const savedLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

function stubGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function stubWebAssembly(name: string, value: unknown): void {
  Object.defineProperty(WebAssembly, name, {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  stubGlobal('fetch', savedFetch);
  stubGlobal('caches', savedCaches);
  stubWebAssembly('instantiate', savedInstantiate);
  if (savedLocation) Object.defineProperty(globalThis, 'location', savedLocation);
  else delete (globalThis as Record<string, unknown>).location;
  mock.restoreAll();
});

// A minimal but genuinely valid module: magic plus version, no sections. The
// loader only ever inspects the first four bytes, so this is enough to exercise
// every branch.
const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

// captureInstantiate stubs WebAssembly.instantiate and records the bytes the
// loader actually handed the compiler: bytes are hashed before instantiation,
// so the loader always buffers a plain ArrayBuffer/Uint8Array rather than
// streaming into the compiler, unlike the pre-integrity implementation.
function captureInstantiate() {
  const seen: Uint8Array[] = [];
  const fn = mock.fn(async (bytes: ArrayBuffer | Uint8Array) => {
    seen.push(new Uint8Array(bytes));

    return {
      instance: {} as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    };
  });
  stubWebAssembly('instantiate', fn);

  return seen;
}

// The loader identifies the body by its magic number, so the headers a host
// sends are irrelevant to the outcome. Each row pairs a body with headers that
// describe it wrongly, and every row must still instantiate the same module.
const HOSTS: {
  name: string;
  body: () => Uint8Array;
  headers: Record<string, string>;
}[] = [
  {
    name: 'gzip body labelled application/wasm (compressed, mislabelled)',
    body: () => gzipSync(WASM),
    headers: { 'Content-Type': 'application/wasm' },
  },
  {
    name: 'gzip body labelled application/gzip (the plain .gz host)',
    body: () => gzipSync(WASM),
    headers: { 'Content-Type': 'application/gzip' },
  },
  {
    name: 'transport-decoded body still labelled application/gzip',
    body: () => WASM,
    headers: { 'Content-Type': 'application/gzip', 'Content-Encoding': 'gzip' },
  },
  {
    name: 'transport-decoded body with the encoding hidden by CORS',
    body: () => WASM,
    headers: { 'Content-Type': 'application/wasm' },
  },
  {
    name: 'wasm body under a mixed-case MIME type',
    body: () => WASM,
    headers: { 'Content-Type': 'Application/Wasm' },
  },
  {
    name: 'body with no content type at all',
    body: () => gzipSync(WASM),
    headers: {},
  },
];

describe('instantiateRuntimeAsset', { concurrency: false }, () => {
  for (const host of HOSTS) {
    it(`instantiates the module when the host serves a ${host.name}`, async () => {
      const fetchMock = mock.fn(
        async () => new Response(host.body(), { headers: host.headers }),
      );
      stubGlobal('fetch', fetchMock);
      const seen = captureInstantiate();

      await instantiateRuntimeAsset(
        'https://runtime.example/wavewalletdk.wasm.gz',
        'gzip',
        {},
        null,
      );

      // One fetch: the format is read off the body, never by asking again.
      assert.equal(fetchMock.mock.callCount(), 1);
      assert.equal(seen.length, 1);
      // Whatever arrived, the compiler is handed decompressed wasm.
      assert.deepEqual(seen[0], WASM);
    });
  }

  it('preserves a body that spans several chunks', async () => {
    // Padding after the header keeps the magic in the first chunk while the
    // rest arrives later, which is what peekMagic has to stitch back together.
    const padded = new Uint8Array(96 * 1024);
    padded.set(WASM, 0);
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(gzipSync(padded))),
    );
    const seen = captureInstantiate();

    await instantiateRuntimeAsset(
      'https://runtime.example/x.wasm.gz',
      'gzip',
      {},
      null,
    );

    assert.deepEqual(seen[0], padded);
  });

  it('rejects a body that is neither gzip nor wasm', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))),
    );
    captureInstantiate();

    await assert.rejects(
      instantiateRuntimeAsset(
        'https://runtime.example/x.wasm.gz',
        'gzip',
        {},
        null,
      ),
      // An HTML error page served with a 200 lands here, so the message has to
      // point at the URL rather than at a compiler error nobody can act on.
      /runtime asset could not be loaded/,
    );
  });

  it('converts a network or CORS fetch rejection to asset_load_failed', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await assert.rejects(
      instantiateRuntimeAsset(
        'https://runtime.example/x.wasm.gz',
        'gzip',
        {},
        null,
      ),
      (err: unknown) =>
        err instanceof WavelengthError && err.code === 'asset_load_failed',
    );
  });

  it('reports the compile only after it succeeds, tagged with the body it found', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(gzipSync(WASM))),
    );
    captureInstantiate();
    const samples: WavelengthPerformanceEvent[] = [];

    await instantiateRuntimeAsset(
      'https://runtime.example/x.wasm.gz',
      'gzip',
      {},
      null,
      (sample) => samples.push(sample),
    );

    assert.deepEqual(
      samples.filter((s) => s.phase === 'wasmCompileInstantiate').map((s) => s.detail),
      [{ path: 'gzip', streaming: false, body: 'gzip' }],
    );
  });

  it('verifies and instantiates when the pinned digest matches', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(WASM)),
    );
    captureInstantiate();
    const digest = await sha256Sri(WASM.buffer as ArrayBuffer);

    await instantiateRuntimeAsset(
      'https://runtime.example/wavewalletdk.wasm',
      'raw',
      {},
      { 'wavewalletdk.wasm': digest },
    );
  });

  it('rejects tampered bytes before instantiation', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(WASM)),
    );
    const seen = captureInstantiate();

    await assert.rejects(
      instantiateRuntimeAsset(
        'https://runtime.example/wavewalletdk.wasm',
        'raw',
        {},
        {
          'wavewalletdk.wasm':
            'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        },
      ),
      (err: unknown) =>
        err instanceof WavelengthError && err.code === 'asset_integrity_failed',
    );
    assert.equal(seen.length, 0);
  });
});

describe('instantiateWasm', { concurrency: false }, () => {
  it('falls back to the uncompressed asset when the compressed one is missing', async () => {
    const urls: string[] = [];
    stubGlobal(
      'fetch',
      mock.fn(async (url: string) => {
        urls.push(String(url));
        return String(url).endsWith('.gz')
          ? new Response('nope', { status: 404 })
          : new Response(WASM);
      }),
    );
    const seen = captureInstantiate();

    await instantiateWasm({}, 'https://runtime.example/', null);

    assert.deepEqual(urls, [
      'https://runtime.example/wavewalletdk.wasm.gz',
      'https://runtime.example/wavewalletdk.wasm',
    ]);
    assert.deepEqual(seen.at(-1), WASM);
  });

  it('tags the total sample with the outcome so a failed load is filterable', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response('nope', { status: 404 })),
    );
    captureInstantiate();
    const samples: WavelengthPerformanceEvent[] = [];

    await assert.rejects(
      instantiateWasm({}, 'https://runtime.example/', null, (s) =>
        samples.push(s),
      ),
    );

    assert.deepEqual(samples.at(-1)?.detail, { path: 'raw', outcome: 'error' });
  });

  it('verifies the decompressed gzip bytes against the wasm digest', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(gzipSync(WASM))),
    );
    captureInstantiate();
    const digest = await sha256Sri(WASM.buffer as ArrayBuffer);

    const result = await instantiateWasm({}, 'https://runtime.example/', {
      'wavewalletdk.wasm': digest,
    });
    assert.ok(result.instance);
  });

  it('does not fall back to the raw path on an integrity mismatch', async () => {
    const urls: string[] = [];
    stubGlobal(
      'fetch',
      mock.fn(async (url: string) => {
        urls.push(String(url));
        return new Response(gzipSync(WASM));
      }),
    );
    captureInstantiate();

    await assert.rejects(
      instantiateWasm({}, 'https://runtime.example/', {
        'wavewalletdk.wasm':
          'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      }),
      (err: unknown) =>
        err instanceof WavelengthError && err.code === 'asset_integrity_failed',
    );
    assert.deepEqual(urls, ['https://runtime.example/wavewalletdk.wasm.gz']);
  });
});

// A cache that behaves like the parts of Cache Storage the loader touches.
class FakeCache {
  readonly stored = new Map<string, Uint8Array>();
  deleted: string[] = [];
  async match(url: string) {
    const bytes = this.stored.get(new Request(url).url);
    return bytes ? new Response(bytes) : undefined;
  }
  async put(url: string, response: Response) {
    this.stored.set(
      new Request(url).url,
      new Uint8Array(await response.arrayBuffer()),
    );
  }
  async keys() {
    return [...this.stored.keys()].map((url) => new Request(url));
  }
  async delete(request: Request | string) {
    const url = typeof request === 'string' ? new Request(request).url : request.url;
    this.deleted.push(url);
    return this.stored.delete(url);
  }
}

function stubCaches(cache: FakeCache) {
  stubGlobal('caches', {
    open: async () => cache,
    keys: async () => [],
    delete: async () => true,
  });
}

describe('instantiateRuntimeAsset with a cache', { concurrency: false }, () => {
  const URL_GZ = 'https://runtime.example/wavewalletdk.wasm.gz';

  it('stores decompressed wasm even though the wire body was gzip', async () => {
    const cache = new FakeCache();
    stubCaches(cache);
    stubGlobal('fetch', mock.fn(async () => new Response(gzipSync(WASM))));
    captureInstantiate();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, null);
    // The put is deliberately not awaited, so let it settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Collected downstream of the DecompressionStream, so the entry is wasm.
    assert.deepEqual([...cache.stored.values()][0], WASM);
  });

  it('reads a warm entry without touching the network', async () => {
    const cache = new FakeCache();
    cache.stored.set(new Request(URL_GZ).url, WASM);
    stubCaches(cache);
    const fetchMock = mock.fn(async () => new Response(gzipSync(WASM)));
    stubGlobal('fetch', fetchMock);
    stubWebAssembly('instantiate', mock.fn(async () => ({
      instance: {} as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    })));

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, null);

    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it('verifies a cached entry against the pinned digest before instantiating it', async () => {
    const cache = new FakeCache();
    cache.stored.set(new Request(URL_GZ).url, WASM);
    stubCaches(cache);
    const fetchMock = mock.fn(async () => new Response(gzipSync(WASM)));
    stubGlobal('fetch', fetchMock);
    captureInstantiate();
    const digest = await sha256Sri(WASM.buffer as ArrayBuffer);

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, {
      'wavewalletdk.wasm': digest,
    });

    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it('evicts a tampered cached entry and re-verifies the network refetch', async () => {
    const cache = new FakeCache();
    cache.stored.set(new Request(URL_GZ).url, new Uint8Array([9, 9, 9, 9]));
    stubCaches(cache);
    const fetchMock = mock.fn(async () => new Response(gzipSync(WASM)));
    stubGlobal('fetch', fetchMock);
    captureInstantiate();
    const digest = await sha256Sri(WASM.buffer as ArrayBuffer);

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, {
      'wavewalletdk.wasm': digest,
    });

    assert.deepEqual(cache.deleted, [new Request(URL_GZ).url]);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it('never stores bytes that failed to compile', async () => {
    const cache = new FakeCache();
    stubCaches(cache);
    stubGlobal('fetch', mock.fn(async () => new Response(gzipSync(WASM))));
    stubWebAssembly('instantiate', mock.fn(async () => {
      throw new Error('compile failed');
    }));

    await assert.rejects(instantiateRuntimeAsset(URL_GZ, 'gzip', {}, null));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(cache.stored.size, 0);
  });

  it('evicts a cached entry that will not instantiate and refetches', async () => {
    const cache = new FakeCache();
    cache.stored.set(new Request(URL_GZ).url, new Uint8Array([9, 9, 9, 9]));
    stubCaches(cache);
    const fetchMock = mock.fn(async () => new Response(gzipSync(WASM)));
    stubGlobal('fetch', fetchMock);
    // The cache read and the post-fetch instantiate now go through the same
    // WebAssembly.instantiate, so one stub has to fail the first call (the bad
    // cached bytes) and succeed the second (the refetched, good bytes).
    let calls = 0;
    stubWebAssembly(
      'instantiate',
      mock.fn(async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('bad cached bytes');
        }

        return {
          instance: {} as WebAssembly.Instance,
          module: {} as WebAssembly.Module,
        };
      }),
    );

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, null);

    assert.deepEqual(cache.deleted, [new Request(URL_GZ).url]);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});

describe('runtimeCache: false', { concurrency: false }, () => {
  const URL_GZ = 'https://runtime.example/wavewalletdk.wasm.gz';

  it('takes the module from the network even when a copy is cached', async () => {
    const cache = new FakeCache();
    cache.stored.set(new Request(URL_GZ).url, WASM);
    stubCaches(cache);
    const fetchMock = mock.fn(async () => new Response(gzipSync(WASM)));
    stubGlobal('fetch', fetchMock);
    captureInstantiate();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, null, undefined, false);

    assert.equal(fetchMock.mock.callCount(), 1, 'the network was used');
  });

  it('leaves an existing entry exactly as it was', async () => {
    // Opting out must not be a way to delete data: the stale entry stays, so
    // turning the option back on resumes from it.
    const cache = new FakeCache();
    const existing = new Uint8Array([1, 2, 3, 4]);
    cache.stored.set(new Request(URL_GZ).url, existing);
    cache.stored.set('https://runtime.example/other', existing);
    stubCaches(cache);
    stubGlobal('fetch', mock.fn(async () => new Response(gzipSync(WASM))));
    captureInstantiate();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, null, undefined, false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(cache.stored.get(new Request(URL_GZ).url), existing);
    // The other entry proves pruning did not run either.
    assert.ok(cache.stored.has('https://runtime.example/other'));
    assert.deepEqual(cache.deleted, []);
  });

  it('still caches by default', async () => {
    const cache = new FakeCache();
    stubCaches(cache);
    stubGlobal('fetch', mock.fn(async () => new Response(gzipSync(WASM))));
    captureInstantiate();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(cache.stored.size, 1);
  });
});

// A minimal document whose appended scripts "load" on the next microtask.
// A fresh object each call, which is what gives loadVerifiedScript's
// per-document dedupe cache test isolation without an explicit reset: the
// cache is keyed on this object's identity.
function stubDocument() {
  const created: Array<Record<string, unknown>> = [];
  const doc = {
    createElement: () => {
      const el: Record<string, unknown> = { dataset: {} };
      created.push(el);
      return el;
    },
    head: {
      append: (el: { onload?: () => void }) =>
        queueMicrotask(() => el.onload?.()),
    },
  };
  (globalThis as Record<string, unknown>).document = doc;
  return created;
}

describe('loadVerifiedScript', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
  });

  for (const [context, asset] of [
    ['chrome-extension://aaaaaaaa/', 'https://assets.example/wasm_exec.js'],
    ['chrome-extension://aaaaaaaa/', 'chrome-extension://bbbbbbbb/wasm_exec.js'],
    ['https://app.example/', 'https://app.example/wasm_exec.js'],
  ]) {
    it(`keeps blob execution for ${asset} from ${context}`, async () => {
      const bytes = new TextEncoder().encode('/* verified fixture */');
      const digest = await sha256Sri(bytes.buffer as ArrayBuffer);
      stubGlobal('location', { href: context });
      stubGlobal('fetch', async () => new Response(bytes));
      const created = stubDocument();
      await loadVerifiedScript(asset, 'wasm_exec.js', { 'wasm_exec.js': digest });
      assert.match(String(created[0]?.src), /^blob:/);
    });
  }

  it('executes a verified script from a blob URL and revokes it', async () => {
    const bytes = new TextEncoder().encode('globalThis.__x = 1;');
    const digest = await sha256Sri(bytes.buffer as ArrayBuffer);
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(bytes)),
    );
    const created = stubDocument();
    const revoke = mock.method(URL, 'revokeObjectURL', () => undefined);

    await loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', {
      'wasm_exec.js': digest,
    });

    assert.equal(created.length, 1);
    assert.match(String(created[0]?.src), /^blob:/);
    assert.deepEqual(created[0]?.dataset, {
      wavelengthSrc: 'https://x/wasm_exec.js',
    });
    assert.equal(revoke.mock.callCount(), 1);
  });

  it('rejects tampered bytes before executing anything', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(new TextEncoder().encode('evil'))),
    );
    const created = stubDocument();

    await assert.rejects(
      loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', {
        'wasm_exec.js': 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      }),
      (err: unknown) =>
        err instanceof WavelengthError && err.code === 'asset_integrity_failed',
    );
    assert.equal(created.length, 0);
  });

  it('dedupes a second call for an already-loaded URL without refetching', async () => {
    const bytes = new TextEncoder().encode('globalThis.__x = 1;');
    const fetchMock = mock.fn(async () => new Response(bytes));
    stubGlobal('fetch', fetchMock);
    const created = stubDocument();

    await loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null);
    await loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null);

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(created.length, 1);
  });

  it('dedupes two concurrent calls for the same URL into one fetch and one script', async () => {
    // The regression this guards: fetch, verify, and blob-execute all await,
    // so two callers racing for the same URL before either resolves must
    // still only fetch and execute once. A synchronous DOM-query dedupe
    // (the pre-existing <script src> mechanism this replaced) could not
    // observe that race; a dedupe keyed on the URL synchronously, before any
    // await, can.
    const bytes = new TextEncoder().encode('globalThis.__x = 1;');
    const fetchMock = mock.fn(async () => new Response(bytes));
    stubGlobal('fetch', fetchMock);
    const created = stubDocument();

    await Promise.all([
      loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null),
      loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null),
    ]);

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(created.length, 1);
  });

  it('does not dedupe a verifying call onto a call that skipped verification', async () => {
    // The dedupe cache must not let a client constructed with
    // runtimeIntegrity: false silently hand its unverified load to a
    // stricter client sharing the same document: resolveIntegrityDigests
    // only ever returns null or the shared digest table, so keying on
    // whether digests is present is exact, not a fingerprint.
    const bytes = new TextEncoder().encode('globalThis.__x = 1;');
    const digest = await sha256Sri(bytes.buffer as ArrayBuffer);
    const fetchMock = mock.fn(async () => new Response(bytes));
    stubGlobal('fetch', fetchMock);
    const created = stubDocument();

    await loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null);
    await loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', {
      'wasm_exec.js': digest,
    });

    assert.equal(fetchMock.mock.callCount(), 2);
    assert.equal(created.length, 2);
  });

  it('does not cache a failed load, so a later call can retry', async () => {
    let calls = 0;
    stubGlobal(
      'fetch',
      mock.fn(async () => {
        calls += 1;
        if (calls === 1) {
          throw new TypeError('Failed to fetch');
        }

        return new Response(new TextEncoder().encode('globalThis.__x = 1;'));
      }),
    );
    const created = stubDocument();

    await assert.rejects(
      loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null),
    );
    await loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null);

    assert.equal(calls, 2);
    assert.equal(created.length, 1);
  });

  it('converts a network or CORS fetch rejection to asset_load_failed', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    stubDocument();

    await assert.rejects(
      loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null),
      (err: unknown) =>
        err instanceof WavelengthError && err.code === 'asset_load_failed',
    );
  });

  it('skips hashing when verification is disabled', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(new TextEncoder().encode('anything'))),
    );
    const created = stubDocument();

    await loadVerifiedScript('https://x/wasm_exec.js', 'wasm_exec.js', null);

    assert.equal(created.length, 1);
  });
});

describe('instantiateWasm with a failing stream', { concurrency: false }, () => {
  it('falls back without leaving an unhandled rejection', async () => {
    // A body whose first chunk carries the gzip magic and which then errors, as
    // a dropped connection mid-download does. Both tee branches error together,
    // so the buffered read rejects and the loader falls back. The abandoned
    // cache copy must not surface as an unhandledRejection, which is what a
    // consumer would file a bug about.
    // Real gzip with its trailing CRC and length cut off: the magic check
    // passes, and DecompressionStream errors only once it reaches the end.
    const truncated = gzipSync(new Uint8Array(96 * 1024)).slice(0, -30);
    const dying = () => new Response(truncated);
    const cache = new FakeCache();
    stubCaches(cache);
    stubGlobal(
      'fetch',
      mock.fn(async (url: string) =>
        String(url).endsWith('.gz') ? dying() : new Response(WASM),
      ),
    );
    captureInstantiate();

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const result = await instantiateWasm({}, 'https://runtime.example/', null);
      assert.ok(result.instance, 'the raw asset still loads');
      // Rejections are reported a macrotask after they go unhandled, so give
      // the loop a turn before concluding there were none.
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('instantiateRuntimeAsset raw path body-read failure', { concurrency: false }, () => {
  it('converts a terminal body-read failure to asset_load_failed', async () => {
    // Unlike the gzip path, the raw asset is the last fallback: nothing
    // catches a failure here, so it must surface as the documented
    // asset_load_failed rather than a raw stream error. The magic-byte peek
    // (which tees the response and cancels its branch, itself triggering an
    // extra pull) must be satisfied by valid chunks before the full read
    // fails, so the failure is attributable to the buffered read, not the peek.
    const MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 2) {
          controller.enqueue(MAGIC);
          return;
        }
        controller.error(new Error('connection reset'));
      },
    });
    stubGlobal('fetch', mock.fn(async () => new Response(stream)));

    await assert.rejects(
      instantiateRuntimeAsset(
        'https://runtime.example/wavewalletdk.wasm',
        'raw',
        {},
        null,
        undefined,
        false,
      ),
      (err: unknown) =>
        err instanceof WavelengthError && err.code === 'asset_load_failed',
    );
  });

  it('converts a connection dropped before the magic bytes arrive, without an unhandled rejection', async () => {
    // peekMagic's finally block cancels its reader; cancelling a reader whose
    // stream already errored (the failed read below) itself rejects with the
    // same error, which is a second, separate promise from the one this
    // function awaits. If that cancellation rejection is not also caught, it
    // surfaces as an unhandled rejection alongside the coded error this test
    // asserts on.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    stubGlobal('fetch', mock.fn(async () => new Response(stream)));

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      await assert.rejects(
        instantiateRuntimeAsset(
          'https://runtime.example/wavewalletdk.wasm',
          'raw',
          {},
          null,
          undefined,
          false,
        ),
        (err: unknown) =>
          err instanceof WavelengthError && err.code === 'asset_load_failed',
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

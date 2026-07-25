import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, it, mock } from 'node:test';
import type { WavelengthPerformanceEvent } from '@lightninglabs/wavelength-core';
import { instantiateRuntimeAsset, instantiateWasm } from './runtime.ts';

const savedFetch = globalThis.fetch;
const savedCaches = (globalThis as { caches?: unknown }).caches;
const savedInstantiate = WebAssembly.instantiate;
const savedInstantiateStreaming = WebAssembly.instantiateStreaming;

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
  stubWebAssembly('instantiateStreaming', savedInstantiateStreaming);
});

// A minimal but genuinely valid module: magic plus version, no sections. The
// loader only ever inspects the first four bytes, so this is enough to exercise
// every branch.
const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

// captureStreaming stubs instantiateStreaming and records what the loader
// actually handed the compiler: the bytes and the content type. Those two are
// the loader's whole contract, so asserting on them beats counting calls.
function captureStreaming() {
  const seen: { bytes: Uint8Array; contentType: string | null }[] = [];
  const fn = mock.fn(async (source: Response | Promise<Response>) => {
    const response = await source;
    seen.push({
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get('content-type'),
    });

    return {
      instance: {} as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    };
  });
  stubWebAssembly('instantiateStreaming', fn);

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
      const seen = captureStreaming();

      await instantiateRuntimeAsset(
        'https://runtime.example/wavewalletdk.wasm.gz',
        'gzip',
        {},
      );

      // One fetch: the format is read off the body, never by asking again.
      assert.equal(fetchMock.mock.callCount(), 1);
      assert.equal(seen.length, 1);
      // Whatever arrived, the compiler is handed decompressed wasm...
      assert.deepEqual(seen[0].bytes, WASM);
      // ...under the MIME type it requires, which we set rather than the host.
      assert.equal(seen[0].contentType, 'application/wasm');
    });
  }

  it('preserves a body that spans several chunks', async () => {
    // Padding after the header keeps the magic in the first chunk while the
    // rest arrives later, which is what peekBody has to stitch back together.
    const padded = new Uint8Array(96 * 1024);
    padded.set(WASM, 0);
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(gzipSync(padded))),
    );
    const seen = captureStreaming();

    await instantiateRuntimeAsset('https://runtime.example/x.wasm.gz', 'gzip', {});

    assert.deepEqual(seen[0].bytes, padded);
  });

  it('rejects a body that is neither gzip nor wasm', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))),
    );
    captureStreaming();

    await assert.rejects(
      instantiateRuntimeAsset('https://runtime.example/x.wasm.gz', 'gzip', {}),
      // An HTML error page served with a 200 lands here, so the message has to
      // point at the URL rather than at a compiler error nobody can act on.
      /runtime asset could not be loaded/,
    );
  });

  it('reports the compile only after it succeeds, tagged with the body it found', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response(gzipSync(WASM))),
    );
    captureStreaming();
    const samples: WavelengthPerformanceEvent[] = [];

    await instantiateRuntimeAsset(
      'https://runtime.example/x.wasm.gz',
      'gzip',
      {},
      (sample) => samples.push(sample),
    );

    assert.deepEqual(
      samples.filter((s) => s.phase === 'wasmCompileInstantiate').map((s) => s.detail),
      [{ path: 'gzip', streaming: true, body: 'gzip' }],
    );
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
    const seen = captureStreaming();

    await instantiateWasm({}, 'https://runtime.example/');

    assert.deepEqual(urls, [
      'https://runtime.example/wavewalletdk.wasm.gz',
      'https://runtime.example/wavewalletdk.wasm',
    ]);
    assert.deepEqual(seen.at(-1)?.bytes, WASM);
  });

  it('tags the total sample with the outcome so a failed load is filterable', async () => {
    stubGlobal(
      'fetch',
      mock.fn(async () => new Response('nope', { status: 404 })),
    );
    captureStreaming();
    const samples: WavelengthPerformanceEvent[] = [];

    await assert.rejects(
      instantiateWasm({}, 'https://runtime.example/', (s) => samples.push(s)),
    );

    assert.deepEqual(samples.at(-1)?.detail, { path: 'raw', outcome: 'error' });
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
    captureStreaming();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {});
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

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {});

    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it('never stores bytes that failed to compile', async () => {
    const cache = new FakeCache();
    stubCaches(cache);
    stubGlobal('fetch', mock.fn(async () => new Response(gzipSync(WASM))));
    stubWebAssembly('instantiateStreaming', mock.fn(async () => {
      throw new Error('compile failed');
    }));

    await assert.rejects(instantiateRuntimeAsset(URL_GZ, 'gzip', {}));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(cache.stored.size, 0);
  });

  it('evicts a cached entry that will not instantiate and refetches', async () => {
    const cache = new FakeCache();
    cache.stored.set(new Request(URL_GZ).url, new Uint8Array([9, 9, 9, 9]));
    stubCaches(cache);
    const fetchMock = mock.fn(async () => new Response(gzipSync(WASM)));
    stubGlobal('fetch', fetchMock);
    stubWebAssembly('instantiate', mock.fn(async () => {
      throw new Error('bad cached bytes');
    }));
    captureStreaming();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {});

    assert.deepEqual(cache.deleted, [new Request(URL_GZ).url]);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});

describe('instantiateWasm with a failing stream', { concurrency: false }, () => {
  it('falls back without leaving an unhandled rejection', async () => {
    // A body whose first chunk carries the gzip magic and which then errors, as
    // a dropped connection mid-download does. Both tee branches error together,
    // so the compile rejects and the loader falls back. The abandoned cache
    // copy must not surface as an unhandledRejection, which is what a consumer
    // would file a bug about.
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
    captureStreaming();

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const result = await instantiateWasm({}, 'https://runtime.example/');
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

describe('runtimeCache: false', { concurrency: false }, () => {
  const URL_GZ = 'https://runtime.example/wavewalletdk.wasm.gz';

  it('takes the module from the network even when a copy is cached', async () => {
    const cache = new FakeCache();
    cache.stored.set(new Request(URL_GZ).url, WASM);
    stubCaches(cache);
    const fetchMock = mock.fn(async () => new Response(gzipSync(WASM)));
    stubGlobal('fetch', fetchMock);
    captureStreaming();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, undefined, false);

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
    captureStreaming();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {}, undefined, false);
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
    captureStreaming();

    await instantiateRuntimeAsset(URL_GZ, 'gzip', {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(cache.stored.size, 1);
  });
});

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { RUNTIME_MANIFEST_VERSION } from '@lightninglabs/wavelength-core';
import {
  RUNTIME_CACHE_NAME,
  absoluteRuntimeUrl,
  evictRuntimeAsset,
  matchRuntimeAsset,
  openRuntimeCache,
  pruneRuntimeCache,
  storeRuntimeAsset,
} from './runtime-cache.ts';

const BASE = 'https://cdn.example.com/runtime';
const V1 = `${BASE}/v0.1.0/wavewalletdk.wasm.gz`;
const V2 = `${BASE}/v0.2.0/wavewalletdk.wasm.gz`;

const savedCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');

function stubCaches(value: unknown): void {
  Object.defineProperty(globalThis, 'caches', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (savedCaches) {
    Object.defineProperty(globalThis, 'caches', savedCaches);
  } else {
    delete (globalThis as { caches?: unknown }).caches;
  }
});

// FakeCache is a minimal stand-in for a Cache: enough of match/put/keys/delete
// to exercise the pruning rules, keyed by absolute URL the way the real one is.
class FakeCache {
  entries = new Map<string, Response>();
  failPut = false;
  failKeys = false;

  async match(url: string): Promise<Response | undefined> {
    return this.entries.get(url);
  }

  async put(url: string, response: Response): Promise<void> {
    if (this.failPut) {
      throw new Error('quota exceeded');
    }
    this.entries.set(url, response);
  }

  async keys(): Promise<Request[]> {
    if (this.failKeys) {
      throw new Error('cannot enumerate');
    }

    return [...this.entries.keys()].map((url) => new Request(url));
  }

  async delete(request: Request | string): Promise<boolean> {
    const url = typeof request === 'string' ? request : request.url;

    return this.entries.delete(url);
  }

  asCache(): Cache {
    return this as unknown as Cache;
  }
}

// FakeCacheStorage tracks which buckets were opened and deleted so the schema
// cleanup can be observed.
class FakeCacheStorage {
  buckets = new Map<string, FakeCache>();
  deleted: string[] = [];

  constructor(names: string[] = []) {
    for (const name of names) {
      this.buckets.set(name, new FakeCache());
    }
  }

  async open(name: string): Promise<Cache> {
    const existing = this.buckets.get(name) ?? new FakeCache();
    this.buckets.set(name, existing);

    return existing.asCache();
  }

  async keys(): Promise<string[]> {
    return [...this.buckets.keys()];
  }

  async delete(name: string): Promise<boolean> {
    this.deleted.push(name);

    return this.buckets.delete(name);
  }
}

describe('openRuntimeCache', { concurrency: false }, () => {
  it('returns undefined when Cache Storage is unavailable', async () => {
    stubCaches(undefined);
    assert.equal(await openRuntimeCache(), undefined);
  });

  it('returns undefined when reading caches throws', async () => {
    Object.defineProperty(globalThis, 'caches', {
      get() {
        throw new Error('denied in this context');
      },
      configurable: true,
    });
    assert.equal(await openRuntimeCache(), undefined);
  });

  it('returns undefined when the bucket cannot be opened', async () => {
    stubCaches({
      async open() {
        throw new Error('nope');
      },
      async keys() {
        return [];
      },
    });
    assert.equal(await openRuntimeCache(), undefined);
  });

  it('drops buckets from a superseded schema but spares foreign ones', async () => {
    const storage = new FakeCacheStorage([
      'wavelength-runtime-v0',
      RUNTIME_CACHE_NAME,
      'some-app-assets',
    ]);
    stubCaches(storage);

    assert.ok(await openRuntimeCache());
    // The cleanup is detached from the open, so let the microtasks settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(storage.deleted, ['wavelength-runtime-v0']);
  });

  it('keys the bucket on the runtime version so an upgrade cannot read it', () => {
    // Hosting the runtime at a stable unversioned URL is supported, so the URL
    // cannot distinguish one release's module from another's. The bucket name
    // is what makes an upgrade miss rather than instantiate the old daemon.
    assert.ok(RUNTIME_CACHE_NAME.endsWith(`-${RUNTIME_MANIFEST_VERSION}`));
  });

  it('drops a bucket left by a different runtime version', async () => {
    const previous = `wavelength-runtime-v1-${RUNTIME_MANIFEST_VERSION}-old`;
    const storage = new FakeCacheStorage([previous, 'some-app-assets']);
    stubCaches(storage);

    assert.ok(await openRuntimeCache());
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(storage.deleted, [previous]);
  });
});

describe('absoluteRuntimeUrl', () => {
  it('passes an absolute URL through unchanged', () => {
    assert.equal(absoluteRuntimeUrl(V1), V1);
  });

  it('returns the input rather than throwing when it cannot resolve', () => {
    // A bare filename has no base to resolve against outside a document, which
    // must degrade to a passthrough instead of breaking the load.
    assert.equal(
      absoluteRuntimeUrl('wavewalletdk.wasm.gz'),
      'wavewalletdk.wasm.gz',
    );
  });
});

describe('matchRuntimeAsset', () => {
  it('returns the cached response on a hit', async () => {
    const cache = new FakeCache();
    const stored = new Response('bytes');
    cache.entries.set(V1, stored);

    assert.equal(await matchRuntimeAsset(cache.asCache(), V1), stored);
  });

  it('returns undefined on a miss', async () => {
    const cache = new FakeCache();
    assert.equal(await matchRuntimeAsset(cache.asCache(), V1), undefined);
  });

  it('returns undefined when the lookup throws', async () => {
    const cache = {
      async match() {
        throw new Error('boom');
      },
    } as unknown as Cache;

    assert.equal(await matchRuntimeAsset(cache, V1), undefined);
  });
});

describe('storeRuntimeAsset', { concurrency: false }, () => {
  it('stores the response and evicts the previous runtime', async () => {
    const cache = new FakeCache();
    cache.entries.set(V1, new Response('old runtime'));

    assert.equal(
      await storeRuntimeAsset(cache.asCache(), V2, new Response('new runtime')),
      true,
    );

    // A release must leave one runtime cached, not one per version ever seen.
    assert.deepEqual([...cache.entries.keys()], [V2]);
  });

  it('reports failure when the write is rejected', async () => {
    const cache = new FakeCache();
    cache.failPut = true;

    assert.equal(
      await storeRuntimeAsset(cache.asCache(), V1, new Response('bytes')),
      false,
    );
    assert.equal(cache.entries.size, 0);
  });
});

describe('pruneRuntimeCache', () => {
  it('keeps the requested entry and drops the rest', async () => {
    const cache = new FakeCache();
    cache.entries.set(V1, new Response('a'));
    cache.entries.set(V2, new Response('b'));
    cache.entries.set(`${BASE}/v0.0.9/wavewalletdk.wasm.gz`, new Response('c'));

    assert.equal(await pruneRuntimeCache(cache.asCache(), V2), 2);
    assert.deepEqual([...cache.entries.keys()], [V2]);
  });

  it('keeps everything when there is nothing stale', async () => {
    const cache = new FakeCache();
    cache.entries.set(V1, new Response('a'));

    assert.equal(await pruneRuntimeCache(cache.asCache(), V1), 0);
    assert.deepEqual([...cache.entries.keys()], [V1]);
  });

  it('drops nothing when the cache cannot be enumerated', async () => {
    const cache = new FakeCache();
    cache.entries.set(V1, new Response('a'));
    cache.failKeys = true;

    assert.equal(await pruneRuntimeCache(cache.asCache(), V2), 0);
    assert.deepEqual([...cache.entries.keys()], [V1]);
  });
});

describe('evictRuntimeAsset', () => {
  it('removes the entry', async () => {
    const cache = new FakeCache();
    cache.entries.set(V1, new Response('a'));

    await evictRuntimeAsset(cache.asCache(), V1);
    assert.equal(cache.entries.size, 0);
  });

  it('swallows a delete that throws', async () => {
    const cache = {
      async delete() {
        throw new Error('boom');
      },
    } as unknown as Cache;

    await evictRuntimeAsset(cache, V1);
  });
});

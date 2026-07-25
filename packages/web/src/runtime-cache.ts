/**
 * Persistent storage for the daemon runtime binary, so a returning visitor does
 * not re-download it.
 *
 * The wasm module is around 20 MB compressed, and that is large enough that
 * Chrome refuses to keep it in the HTTP cache. Reading Resource Timing across
 * repeated loads of one deployment shows `transferSize` staying at the full
 * body size every single time, while a 1 MiB asset served with byte-identical
 * headers drops to 0 after the first fetch. The headers are not the problem:
 * this happens with `Cache-Control: public,max-age=31536000,immutable` and a
 * CDN cache hit. The browser simply declines to store an entry that big, so
 * every load pays the full transfer.
 *
 * That transfer is the dominant startup cost. Once the bytes are local,
 * compiling and instantiating the module takes about 140 ms, because V8
 * compiles Go wasm lazily. Everything else is waiting on the network.
 *
 * Cache Storage has no such size ceiling, so we keep the bytes ourselves and
 * the wasm load turns into a disk read. Note that caching the *compiled*
 * module is not an option: a `WebAssembly.Module` survives `structuredClone`,
 * but IndexedDB rejects it outright ("A WebAssembly.Module can not be
 * serialized for storage"), so bytes are the only durable form.
 *
 * Only one runtime is ever kept, and it belongs to exactly one SDK release.
 * The bucket name carries RUNTIME_MANIFEST_VERSION, so an upgrade looks in a
 * bucket that does not exist yet and refetches, and `openRuntimeCache` drops
 * the previous version's bucket on the way past. Versioning the bucket rather
 * than trusting the URL is deliberate: whether the asset path carries a version
 * segment is the consumer's choice, and hosting the runtime at a stable
 * unversioned URL is supported, so the URL alone cannot tell one release's
 * module from another's. Within a bucket, every load that stores also prunes
 * whatever it did not just ask for, so the compressed and uncompressed forms
 * of the same runtime never both occupy disk. A warm load stores nothing and
 * so prunes nothing, which is harmless: it read the entry it came for.
 *
 * Nothing here is load-bearing. Cache Storage is absent outside a secure
 * context, throws on access in some privacy modes, and rejects writes once an
 * origin is over quota. Every operation degrades to "no cache" instead of
 * failing the wallet.
 */

import { RUNTIME_MANIFEST_VERSION } from '@lightninglabs/wavelength-core';

/**
 * RUNTIME_CACHE_NAME is the Cache Storage bucket holding the runtime bytes.
 *
 * Two versions ride in the name. `v1` is the *schema* of what we store: bump it
 * when the stored representation changes, so old buckets are abandoned
 * wholesale rather than misread. The trailing RUNTIME_MANIFEST_VERSION is the
 * daemon build the bytes belong to, so an SDK upgrade can never read the
 * previous release's module back. `openRuntimeCache` deletes any sibling
 * bucket sharing the prefix, which covers both.
 */
export const RUNTIME_CACHE_NAME =
  `wavelength-runtime-v1-${RUNTIME_MANIFEST_VERSION}`;

// RUNTIME_CACHE_PREFIX identifies buckets this module owns, so a schema bump can
// clean up after its predecessors without touching a consumer's own caches.
const RUNTIME_CACHE_PREFIX = 'wavelength-runtime-';

// cacheStorage reads globalThis.caches defensively. Outside a secure context the
// property is missing, and some privacy modes throw on access rather than
// returning undefined, so both have to be treated as "unavailable".
function cacheStorage(): CacheStorage | undefined {
  try {
    return globalThis.caches;
  } catch {
    return undefined;
  }
}

/**
 * absoluteRuntimeUrl resolves an asset URL the way Cache Storage will.
 *
 * Request keys read back from a cache are always absolute, while
 * `resolveRuntimeAsset` yields a bare filename when no runtime base URL is
 * configured. Comparing the two forms directly would make every entry look
 * stale and prune the cache on every load.
 */
export function absoluteRuntimeUrl(url: string): string {
  try {
    return new Request(url).url;
  } catch {
    return url;
  }
}

/**
 * openRuntimeCache opens the runtime bucket, returning undefined when this
 * context cannot use Cache Storage at all.
 *
 * Opening also drops buckets left behind by an earlier schema version.
 */
export async function openRuntimeCache(): Promise<Cache | undefined> {
  const caches = cacheStorage();
  if (!caches) {
    return undefined;
  }

  try {
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    void dropSupersededCaches(caches);

    return cache;
  } catch {
    return undefined;
  }
}

// dropSupersededCaches removes buckets from an earlier schema version. It runs
// detached from the load path because reclaiming disk is never urgent.
async function dropSupersededCaches(caches: CacheStorage): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (name) =>
            name.startsWith(RUNTIME_CACHE_PREFIX) &&
            name !== RUNTIME_CACHE_NAME,
        )
        .map((name) => caches.delete(name)),
    );
  } catch {
    // A cache we cannot enumerate is one we cannot clean up. Harmless.
  }
}

/**
 * matchRuntimeAsset returns the cached response for a runtime asset, or
 * undefined when it has not been stored yet.
 */
export async function matchRuntimeAsset(
  cache: Cache,
  url: string,
): Promise<Response | undefined> {
  try {
    return (await cache.match(url)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * storeRuntimeAsset persists a response for the next visit and prunes every
 * other entry, leaving the cache holding just this runtime.
 *
 * Returns whether the write landed. A false result is routine: an origin over
 * quota rejects the put, and there is nothing for the caller to do about it.
 */
export async function storeRuntimeAsset(
  cache: Cache,
  url: string,
  response: Response,
): Promise<boolean> {
  try {
    await cache.put(url, response);
  } catch {
    return false;
  }

  await pruneRuntimeCache(cache, url);

  return true;
}

/**
 * pruneRuntimeCache deletes every entry other than `keepUrl`, leaving the bucket
 * holding only the form of the runtime that was just loaded, so the compressed
 * and uncompressed copies never both occupy disk.
 *
 * This is within-bucket cleanup only. A previous release lives in its own bucket
 * (the name carries RUNTIME_MANIFEST_VERSION) and is dropped by
 * dropSupersededCaches, not here.
 *
 * Returns the number of entries dropped.
 */
export async function pruneRuntimeCache(
  cache: Cache,
  keepUrl: string,
): Promise<number> {
  const keep = absoluteRuntimeUrl(keepUrl);
  try {
    const keys = await cache.keys();
    const stale = keys.filter((request) => request.url !== keep);
    await Promise.all(stale.map((request) => cache.delete(request)));

    return stale.length;
  } catch {
    return 0;
  }
}

/**
 * evictRuntimeAsset drops a single entry, for when cached bytes turn out not to
 * instantiate and the loader wants to fall back to the network.
 */
export async function evictRuntimeAsset(
  cache: Cache,
  url: string,
): Promise<void> {
  try {
    await cache.delete(url);
  } catch {
    // Nothing to do: an entry we cannot delete is one the next load will retry.
  }
}

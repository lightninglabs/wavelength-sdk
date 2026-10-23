import {
  errorMessage,
  WavelengthError,
  type WavelengthPerformanceListener,
} from '@lightninglabs/wavelength-core';
import { performanceNow, reportPerformance } from './performance.ts';
import {
  evictRuntimeAsset,
  matchRuntimeAsset,
  openRuntimeCache,
  storeRuntimeAsset,
} from './runtime-cache.ts';
import { verifyAssetBytes } from './integrity.ts';
import type { RuntimeDigests } from './integrity.ts';
import { RUNTIME_ASSETS } from './runtime-manifest.ts';

/**
 * Resolves a runtime asset name against an optional base URL. With no base the
 * bare name is returned so it resolves relative to the page; otherwise the name
 * is resolved against the base (a trailing slash is added when missing).
 */
export function resolveRuntimeAsset(
  base: string | undefined,
  name: string,
): string {
  if (!base) {
    return name;
  }

  return new URL(name, base.endsWith('/') ? base : base + '/').href;
}

/**
 * Builds an actionable failure for a runtime binary that could not be loaded: it
 * names the URL that failed and points at runtimeBaseUrl, which is almost always
 * the cause (assets not hosted, or the base set wrong). The daemon binaries to
 * host are listed in RUNTIME_ASSET_FILES. Pass the underlying error as `cause`
 * when one is available (for example a fetch() rejection), so a network or CORS
 * failure stays distinguishable from a plain non-ok response in the console.
 */
export function runtimeAssetError(url: string, cause?: unknown): WavelengthError {
  return new WavelengthError(
    `Wavelength runtime asset could not be loaded from ${url}. Host the daemon ` +
      'runtime assets (RUNTIME_ASSET_FILES) and point runtimeBaseUrl at them.',
    'asset_load_failed',
    { cause },
  );
}

/**
 * Reports whether a failure message came from {@link runtimeAssetError}. The
 * worker raises it inside its own scope, where the code cannot cross
 * postMessage, so the client recovers the classification from the text. This
 * string is the SDK's own, but the worker is plain JS and cannot import
 * runtimeAssetError: the literal is hand-copied at every throw site in
 * wavewalletdk-worker.js's fetch paths, not just one, and there is no single
 * source of truth for that count. Those copies are the wording of record;
 * keep this regex in sync with them, not only with runtimeAssetError
 * here. A wasm that fetched but will not instantiate is deliberately left out:
 * the asset arrived, so the worker throws a distinct "failed to instantiate"
 * message that stays a generic error, matching the main-thread path, which lets
 * the raw instantiate failure propagate rather than recode it as asset_load_failed.
 * A sibling phrase, "failed integrity verification", covers digest
 * mismatches; see {@link isRuntimeIntegrityMessage} in integrity.ts.
 */
export function isRuntimeAssetMessage(message: string): boolean {
  return /runtime asset could not be loaded/i.test(message);
}

// Per-document cache of in-flight and completed script loads, keyed on the
// original asset URL plus whether this call verifies (digests !== null).
// Executing from a blob URL (below) means there is no <script src> left to
// query for synchronously, unlike the <script src> loading this replaced,
// where the querySelector check and the append that satisfied it were both
// synchronous, so a concurrent call could never observe the gap between
// them. Fetching, verifying, and blob-executing all await, opening exactly
// that gap: two callers racing for the same URL (for example two
// MainThreadWavelengthClient instances, or React StrictMode's double-invoked
// effects) would otherwise both fetch and both execute the script,
// redefining its globals out from under whichever ran first. The verifying
// flag is part of the key, not just the URL, so a client constructed with
// runtimeIntegrity: false can never win a race and hand its unverified load
// to a client on the same page that expects verification: resolveIntegrityDigests
// only ever returns null or the shared RUNTIME_ASSET_DIGESTS constant, so this
// is exact, not a fingerprint. Keying on the `document` object rather than
// caching module-globally scopes the cache to one page's lifetime without
// needing an explicit reset.
const scriptLoads = new WeakMap<Document, Map<string, Promise<void>>>();

function scriptLoadKey(url: string, digests: RuntimeDigests | null): string {
  return `${digests ? 'verify' : 'skip'}:${url}`;
}

/**
 * Fetches a runtime bootstrap script, verifies its bytes against the pinned
 * digest table (unless digests is null, meaning runtimeIntegrity: false),
 * and executes it via a <script> pointed at a blob URL. Same-extension Chrome
 * assets execute from their packaged URL after verification, since Manifest
 * V3 disallows blob scripts. Executing from a
 * blob means the script cannot resolve siblings from its own location, so
 * callers must pre-set any location-derived globals the script needs (the
 * sqlite bridge globals in loadRuntime). A second call for the same URL and
 * the same verification mode, whether already resolved or still in flight,
 * returns the same promise rather than fetching and executing again; see the
 * scriptLoads comment for why the previous DOM-query dedupe could not
 * survive the awaits this function makes, and why verification mode is part
 * of the dedupe key.
 */
export function loadVerifiedScript(
  url: string,
  name: string,
  digests: RuntimeDigests | null,
): Promise<void> {
  let loads = scriptLoads.get(document);
  if (!loads) {
    loads = new Map();
    scriptLoads.set(document, loads);
  }

  const key = scriptLoadKey(url, digests);
  const pending = loads.get(key);
  if (pending) {
    return pending;
  }

  const promise = loadVerifiedScriptUncached(url, name, digests).catch(
    (err: unknown) => {
      // A failed load must not poison future attempts (a transient network
      // blip should be retriable), so only a successful load stays cached.
      loads.delete(key);
      throw err;
    },
  );
  loads.set(key, promise);

  return promise;
}

async function loadVerifiedScriptUncached(
  url: string,
  name: string,
  digests: RuntimeDigests | null,
): Promise<void> {
  // fetch() rejects on a network or CORS failure rather than resolving with a
  // non-ok response, unlike the <script src> loading this replaced; without
  // this catch that rejection would propagate as a raw, uncoded error instead
  // of the documented asset_load_failed.
  const response = await fetch(url).catch((err: unknown) => {
    throw runtimeAssetError(url, err);
  });
  if (!response.ok) {
    throw runtimeAssetError(url);
  }
  const bytes = await response.arrayBuffer().catch((err: unknown) => {
    throw runtimeAssetError(url, err);
  });
  if (digests) {
    await verifyAssetBytes(bytes, name, url, digests);
  }

  // Only extension-packaged resources can use this path: the browser owns
  // their installed bytes and update lifecycle. A web URL must still execute
  // the exact verified bytes, rather than fetching mutable content twice.
  const packaged = isPackagedExtensionScript(url);
  const scriptURL = packaged ? url : URL.createObjectURL(
    new Blob([bytes], { type: 'text/javascript' }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.async = false;
      script.dataset.wavelengthSrc = url;
      script.onload = () => resolve();
      script.onerror = () => reject(runtimeAssetError(url));
      script.src = scriptURL;
      document.head.append(script);
    });
  } finally {
    if (!packaged) URL.revokeObjectURL(scriptURL);
  }
}

// Mirrored in wavewalletdk-worker.js, which cannot import this TS module.
function isPackagedExtensionScript(url: string): boolean {
  if (!globalThis.location?.href) return false;
  const context = new URL(globalThis.location.href);
  const asset = new URL(url, context);
  return context.protocol === 'chrome-extension:' &&
    asset.protocol === context.protocol && asset.host === context.host &&
    context.host !== '';
}

/**
 * Resolves once the wasm runtime is ready, either immediately when the global
 * wavewalletdkCall hook is already installed or on the next 'wavewalletdk-ready'
 * event.
 */
export function waitForReadyEvent(): Promise<void> {
  if (typeof wavewalletdkCall() === 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    globalThis.addEventListener('wavewalletdk-ready', () => resolve(), {
      once: true,
    });
  });
}

/**
 * Returns the global wavewalletdkCall hook the wasm runtime installs, or
 * undefined before the runtime has booted.
 */
export function wavewalletdkCall() {
  return (
    globalThis as typeof globalThis & {
      wavewalletdkCall?: (method: string, params?: unknown) => Promise<unknown>;
    }
  ).wavewalletdkCall;
}

// The first bytes of a runtime asset say what it is, and headers cannot. A host
// may mislabel the MIME type, and Content-Encoding is not a CORS-safelisted
// response header, so cross-origin it is often invisible even when the
// transport has already decoded the body. Reading the magic number replaces
// that guess with a fact, which is what removes the recovery paths a wrong
// guess used to need.
const GZIP_MAGIC = [0x1f, 0x8b];
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

// The wasm magic is the longer of the two, so four bytes settles either.
const MAGIC_BYTES = 4;

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

function concatChunks(chunks: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }

  return joined;
}

/**
 * Instantiates the module from a copy stored by an earlier visit, or returns
 * undefined when nothing usable is cached.
 *
 * The cache always holds decompressed wasm, so this is a plain read and
 * instantiate with no sniffing. Cached bytes are verified against the pinned
 * digest exactly like a freshly fetched response: Cache Storage is writable by
 * any same-origin script, so trusting a hit unconditionally would turn it into
 * a bypass for the whole feature. Bytes that fail to instantiate, or fail
 * verification, are evicted and reported as a miss, which lets the caller fall
 * back to the network: a truncated, tampered, or otherwise broken entry must
 * not be able to wedge the wallet on every subsequent load.
 */
async function instantiateCachedWasm(
  cache: Cache,
  url: string,
  path: string,
  importObject: WebAssembly.Imports,
  digests: RuntimeDigests | null,
  onPerformance?: WavelengthPerformanceListener,
) {
  const cached = await matchRuntimeAsset(cache, url);
  if (!cached) {
    return undefined;
  }

  const readStartedAt = onPerformance ? performanceNow() : undefined;
  try {
    const bytes = await cached.arrayBuffer();
    if (readStartedAt !== undefined) {
      reportPerformance(onPerformance, {
        stage: 'runtime',
        phase: 'wasmCacheRead',
        durationMs: performanceNow() - readStartedAt,
        detail: { path, bytes: bytes.byteLength },
      });
    }

    if (digests) {
      await verifyAssetBytes(bytes, RUNTIME_ASSETS.wasm, url, digests);
    }

    const compileStartedAt = onPerformance ? performanceNow() : undefined;
    const instantiated = await WebAssembly.instantiate(bytes, importObject);
    // Reported on success only. A miss here is not a load, it is a discarded
    // entry: the caller goes on to fetch and reports its own compile, so
    // reporting a failed one too would put a timing for abandoned work into
    // the same distribution.
    if (compileStartedAt !== undefined) {
      reportPerformance(onPerformance, {
        stage: 'runtime',
        phase: 'wasmCompileInstantiate',
        durationMs: performanceNow() - compileStartedAt,
        detail: { path, streaming: false, source: 'cache' },
      });
    }

    return instantiated;
  } catch (err) {
    console.warn(`cached wasm load failed: ${errorMessage(err)}`);
    await evictRuntimeAsset(cache, url);

    return undefined;
  }
}

/**
 * Reads the first `size` bytes of a response without disturbing the body the
 * caller will actually use.
 *
 * The peek runs on a clone and cancels it as soon as it has the magic, which
 * leaves the original body untouched and, importantly, still native. Wrapping
 * the original in a JS ReadableStream instead would put every byte of a ~130 MB
 * module through a JS pull callback, which measurably slowed the cold load.
 */
async function peekMagic(
  response: Response,
  size: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const body = response.clone().body;
  if (!body) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let read = 0;
  try {
    while (read < size) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      read += value.byteLength;
    }
  } finally {
    // Stops the tee holding the rest of the body for a branch nobody reads.
    // Cancelling a reader whose stream already errored (the read above threw)
    // rejects with that same error; the caller already has it from the read,
    // so this is deliberately swallowed rather than left to surface as an
    // unhandled rejection.
    reader.cancel().catch(() => undefined);
  }

  return concatChunks(chunks);
}

/**
 * Fetches one runtime asset, verifies it, and instantiates it, inflating first
 * when its bytes are gzip.
 *
 * The response's own Content-Type is deliberately not consulted.
 * Content-Encoding is not a CORS-safelisted response header and hosts are
 * unreliable about labelling bodies correctly, so the first bytes are read
 * directly to tell gzip from raw wasm.
 *
 * Bytes are hashed before instantiation, so the full body is buffered here
 * rather than streamed into the compiler: verifying a digest requires the
 * complete ArrayBuffer, and there is no way to check bytes the compiler has
 * already consumed. `path` only tags the performance samples; it never
 * selects behavior.
 */
export async function instantiateRuntimeAsset(
  url: string,
  path: string,
  importObject: WebAssembly.Imports,
  digests: RuntimeDigests | null,
  onPerformance?: WavelengthPerformanceListener,
  runtimeCache = true,
) {
  // Opting out skips opening the bucket at all, so nothing is read, written or
  // pruned, and whatever an earlier session stored is left untouched.
  const cache = runtimeCache ? await openRuntimeCache() : undefined;
  if (cache) {
    const cached = await instantiateCachedWasm(
      cache,
      url,
      path,
      importObject,
      digests,
      onPerformance,
    );
    if (cached) {
      return cached;
    }
  }

  const fetchStartedAt = onPerformance ? performanceNow() : undefined;
  // See loadVerifiedScript's matching comment: fetch() rejects on a network
  // or CORS failure instead of resolving with a non-ok response, so that
  // rejection needs converting to the documented asset_load_failed too.
  const response = await fetch(url).catch((err: unknown) => {
    throw runtimeAssetError(url, err);
  });
  if (fetchStartedAt !== undefined) {
    reportPerformance(onPerformance, {
      stage: 'runtime',
      phase: 'wasmFetchHeaders',
      durationMs: performanceNow() - fetchStartedAt,
      detail: { path },
    });
  }
  if (!response.ok) {
    throw runtimeAssetError(url);
  }
  if (!response.body) {
    throw new WavelengthError(
      `Wavelength runtime asset at ${url} arrived with no body.`,
      'asset_load_failed',
    );
  }

  const prefix = await peekMagic(response, MAGIC_BYTES).catch(
    (err: unknown) => {
      throw runtimeAssetError(url, err);
    },
  );
  const gzipped = startsWith(prefix, GZIP_MAGIC);
  if (!gzipped && !startsWith(prefix, WASM_MAGIC)) {
    // Neither magic number: whatever this is, it is not a runtime binary. Fail
    // here rather than handing it to the compiler, so the error names the URL.
    throw runtimeAssetError(url);
  }
  if (gzipped && !('DecompressionStream' in globalThis)) {
    throw new WavelengthError(
      `Wavelength runtime asset at ${url} is gzip and this browser has no ` +
        'DecompressionStream to inflate it.',
      'asset_load_failed',
    );
  }

  const body = gzipped
    ? response.body.pipeThrough(new DecompressionStream('gzip'))
    : response.body;

  // The digest pins the decompressed binary, so the same RUNTIME_ASSETS.wasm
  // entry verifies bytes fetched from either the compressed or the raw URL.
  const bytes = await new Response(body).arrayBuffer().catch((err: unknown) => {
    throw runtimeAssetError(url, err);
  });
  if (digests) {
    await verifyAssetBytes(bytes, RUNTIME_ASSETS.wasm, url, digests);
  }

  const compileStartedAt = onPerformance ? performanceNow() : undefined;
  const instantiated = await WebAssembly.instantiate(bytes, importObject);
  // Reported on success only. A failed asset falls through to the next one,
  // which reports its own compile, so reporting here too would put a timing for
  // abandoned work into the same distribution.
  if (compileStartedAt !== undefined) {
    reportPerformance(onPerformance, {
      stage: 'runtime',
      phase: 'wasmCompileInstantiate',
      durationMs: performanceNow() - compileStartedAt,
      detail: { path, streaming: false, body: gzipped ? 'gzip' : 'wasm' },
    });
  }

  // Stored only now that the module has both verified and compiled, so bytes
  // that turn out tampered or broken can never become the entry every later
  // load reads. Not awaited: filling the cache must not slow down the load
  // that fills it.
  if (cache) {
    void storeRuntimeAsset(cache, url, new Response(bytes));
  }

  return instantiated;
}

/**
 * Instantiates the wasm module, preferring the gzip-compressed binary and
 * falling back to the uncompressed one (logging a warning) if it cannot be
 * loaded at all.
 *
 * Both assets go through the same loader, which identifies what it actually
 * received rather than trusting the URL or the headers, so a host that serves
 * either file pre-inflated, double-labelled, or behind a transport that decodes
 * for it still lands on one code path. An integrity mismatch on the compressed
 * path does not fall back to the raw one: the raw path would refetch the same
 * content from the same origin, turning a tamper signal into a confusing
 * second failure.
 */
export async function instantiateWasm(
  importObject: WebAssembly.Imports,
  base: string | undefined,
  digests: RuntimeDigests | null,
  onPerformance?: WavelengthPerformanceListener,
  runtimeCache = true,
) {
  const startedAt = onPerformance ? performanceNow() : undefined;
  let path = 'gzip';
  // A load that threw still reports, because the time was really spent, but it
  // is tagged so a consumer can keep abandoned work out of a latency
  // distribution rather than having to infer the failure from the duration.
  let outcome = 'success';
  try {
    try {
      return await instantiateRuntimeAsset(
        resolveRuntimeAsset(base, RUNTIME_ASSETS.wasmGz),
        'gzip',
        importObject,
        digests,
        onPerformance,
        runtimeCache,
      );
    } catch (err) {
      if (
        err instanceof WavelengthError &&
        err.code === 'asset_integrity_failed'
      ) {
        throw err;
      }
      // A body-read failure (a dropped connection after headers arrived) is
      // reported through the same generic asset_load_failed message as a
      // missing host, so surface the underlying cause here too, when there
      // is one, rather than losing the actual reason on every gzip fallback.
      const causeMessage =
        err instanceof Error && err.cause ? errorMessage(err.cause) : '';
      const detail = causeMessage ? ` (${causeMessage})` : '';
      console.warn(`compressed wasm load failed: ${errorMessage(err)}${detail}`);
      path = 'raw';
    }

    return await instantiateRuntimeAsset(
      resolveRuntimeAsset(base, RUNTIME_ASSETS.wasm),
      'raw',
      importObject,
      digests,
      onPerformance,
      runtimeCache,
    );
  } catch (err) {
    outcome = 'error';
    throw err;
  } finally {
    if (startedAt !== undefined) {
      reportPerformance(onPerformance, {
        stage: 'runtime',
        phase: 'wasmTotal',
        durationMs: performanceNow() - startedAt,
        detail: { path, outcome },
      });
    }
  }
}

/**
 * The base the worker resolves daemon assets against when the consumer leaves
 * runtimeBaseUrl unset. The worker resolves bare asset names against its own
 * bundled URL rather than the page, so to match main-thread mode (which resolves
 * page-relative) we hand it the document's directory. Falls back to '' off the
 * main thread, where the worker cannot run.
 */
export function defaultWorkerRuntimeBaseUrl(): string {
  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL('.', document.baseURI).href;
  }

  return '';
}

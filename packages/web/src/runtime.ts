import {
  errorMessage,
  WavelengthError,
  type WavelengthPerformanceListener,
} from '@lightninglabs/wavelength-core';
import { performanceNow, reportPerformance } from './performance.ts';
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
 * host are listed in RUNTIME_ASSET_FILES.
 */
export function runtimeAssetError(url: string): WavelengthError {
  return new WavelengthError(
    `Wavelength runtime asset could not be loaded from ${url}. Host the daemon ` +
      'runtime assets (RUNTIME_ASSET_FILES) and point runtimeBaseUrl at them.',
    'asset_load_failed',
  );
}

/**
 * Reports whether a failure message came from {@link runtimeAssetError}. The
 * worker raises it inside its own scope, where the code cannot cross
 * postMessage, so the client recovers the classification from the text. This
 * string is the SDK's own, but the worker is plain JS and cannot import
 * runtimeAssetError: the literal is hand-copied in wavewalletdk-worker.js at the
 * fetch throws (the response was not ok). Those copies are the wording of
 * record; keep this regex in sync with them, not only with runtimeAssetError
 * here. A wasm that fetched but will not instantiate is deliberately left out:
 * the asset arrived, so the worker throws a distinct "failed to instantiate"
 * message that stays a generic error, matching the main-thread path, which lets
 * the raw instantiate failure propagate rather than recode it as asset_load_failed.
 */
export function isRuntimeAssetMessage(message: string): boolean {
  return /runtime asset could not be loaded/i.test(message);
}

/**
 * Injects a `<script>` tag for the given source and resolves once it loads. A
 * second call for an already-present src resolves immediately, so the same asset
 * is never loaded twice.
 */
export function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(runtimeAssetError(src));
    document.head.append(script);
  });
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
    void reader.cancel();
  }

  return concatChunks(chunks);
}

/**
 * Fetches one runtime asset and instantiates it, inflating first when its bytes
 * are gzip.
 *
 * The response's own Content-Type is deliberately not consulted.
 * `instantiateStreaming` requires `application/wasm` and hosts are unreliable
 * about sending it, so the body is rewrapped in a response this module labels
 * itself. That is also what keeps the compressed path streaming: inflated bytes
 * feed compilation as they arrive rather than being buffered whole first.
 *
 * `path` only tags the performance samples; it never selects behavior.
 */
export async function instantiateRuntimeAsset(
  url: string,
  path: string,
  importObject: WebAssembly.Imports,
  onPerformance?: WavelengthPerformanceListener,
) {
  const fetchStartedAt = onPerformance ? performanceNow() : undefined;
  const response = await fetch(url);
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

  const prefix = await peekMagic(response, MAGIC_BYTES);
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

  const compileStartedAt = onPerformance ? performanceNow() : undefined;
  const instantiated = await WebAssembly.instantiateStreaming(
    new Response(body, { headers: { 'content-type': 'application/wasm' } }),
    importObject,
  );
  // Reported on success only. A failed asset falls through to the next one,
  // which reports its own compile, so reporting here too would put a timing for
  // abandoned work into the same distribution.
  if (compileStartedAt !== undefined) {
    reportPerformance(onPerformance, {
      stage: 'runtime',
      phase: 'wasmCompileInstantiate',
      durationMs: performanceNow() - compileStartedAt,
      detail: { path, streaming: true, body: gzipped ? 'gzip' : 'wasm' },
    });
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
 * for it still lands on one code path.
 */
export async function instantiateWasm(
  importObject: WebAssembly.Imports,
  base: string | undefined,
  onPerformance?: WavelengthPerformanceListener,
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
        onPerformance,
      );
    } catch (err) {
      console.warn(`compressed wasm load failed: ${errorMessage(err)}`);
      path = 'raw';
    }

    return await instantiateRuntimeAsset(
      resolveRuntimeAsset(base, RUNTIME_ASSETS.wasm),
      'raw',
      importObject,
      onPerformance,
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

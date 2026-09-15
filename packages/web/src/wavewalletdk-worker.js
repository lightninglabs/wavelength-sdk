let wasmReady = false;
let loadPromise = null;
let activityHandle = null;
let activityOpen = null;
let activityGeneration = 0;

// The client sends the runtime base URL as this worker's first message (see the
// $init handler below). The bundler fingerprints the worker's own URL, so the
// base can no longer ride in as a query param the way the self-hosted worker's
// did.
let runtimeBaseUrl = "";

// runtimeVersion is RUNTIME_MANIFEST_VERSION, forwarded in $init because this
// worker cannot import it. It names the runtime cache bucket, keeping one SDK
// release's module out of the next one's reach.
let runtimeVersion = "";

// runtimeCache mirrors WebClientOptions.runtimeCache, forwarded in $init. When
// off the bucket is never opened, so nothing is read, written or pruned and an
// existing one is left exactly as it is.
let runtimeCacheEnabled = true;

// The pinned digest table from $init, or null when the client disabled
// verification (runtimeIntegrity: false). Mirrors RUNTIME_ASSET_DIGESTS as
// resolved by the client; this file cannot import the TS manifest.
let assetDigests = null;

// debug mirrors the client's debug option, set from the $init message. When on,
// every RPC request/response is logged - payloads can include addresses and
// amounts, so it stays off unless the consumer opts in.
let debug = false;
let performanceEnabled = false;
function debugTs() {
  return new Date().toISOString().split("T").join(" ").slice(0, -1);
}

function facadeDebugPayload(method, payload) {
  return method === "startExternalSeedWallet"
    ? "[REDACTED external-seed wallet payload]"
    : payload;
}

function performanceNow() {
  return self.performance?.now?.() ?? Date.now();
}

function postPerformance(phase, startedAt, detail) {
  if (!performanceEnabled || startedAt === undefined) {
    return;
  }

  self.postMessage({
    performance: {
      stage: "runtime",
      phase,
      durationMs: performanceNow() - startedAt,
      detail,
    },
  });
}

function resolveRuntimeAsset(name) {
  if (!runtimeBaseUrl) {
    return name;
  }
  return new URL(
    name,
    runtimeBaseUrl.endsWith("/") ? runtimeBaseUrl : runtimeBaseUrl + "/",
  ).href;
}

// Mirrors runtimeAssetError in packages/web/src/runtime.ts, hand-copied
// because this worker is plain JS and cannot import it. Builds the message
// the client's isRuntimeAssetMessage regex matches; keep the wording in sync
// with both.
function assetLoadError(url, cause) {
  return new Error(
    `Wavelength runtime asset could not be loaded from ${url}. Host the ` +
      "daemon runtime assets and point runtimeBaseUrl at them.",
    cause !== undefined ? { cause } : undefined,
  );
}

function postEvent(type, payload) {
  self.postMessage({
    event: {
      type,
      payload,
    },
  });
}

function rejectAllPending(error) {
  const message = String(error?.message || error);
  postEvent("log", { level: "error", message });
  // go.run() settling, whether it resolves (main() returned) or rejects (a
  // trap), means the daemon runtime has exited; signal the main thread so it
  // can reject every in-flight RPC instead of hanging forever.
  self.postMessage({ fatal: { message } });
}

self.addEventListener("wavewalletdk-ready", () => {
  wasmReady = true;
  postEvent("runtimeReady");
});

self.onmessage = async (event) => {
  const data = event.data || {};

  // $init carries the runtime base URL and arrives before any RPC. Handle it
  // ahead of ensureLoaded() so asset resolution sees the base on first load.
  if (data.$init) {
    runtimeBaseUrl = data.$init.runtimeBaseUrl || "";
    runtimeVersion = data.$init.runtimeVersion || "";
    runtimeCacheEnabled = data.$init.runtimeCache !== false;
    debug = !!data.$init.debug;
    performanceEnabled = !!data.$init.performance;
    assetDigests = data.$init.assetDigests || null;

    return;
  }

  const { id, method, params } = data;

  try {
    await ensureLoaded();

    if (method === "$ready") {
      self.postMessage({ id, ok: true, result: { ready: true } });

      return;
    }

    // The wasm bridge's `subscribe` verb resolves to a handle whose JS callbacks
    // cannot cross postMessage, so the worker owns the pull loop and forwards
    // each entry to the main thread as an 'activity' event.
    if (method === "$startActivity") {
      const generation = activityGeneration;
      const pending = activityOpen;
      if (!activityHandle && pending?.generation === generation) {
        await pending.promise;
      } else if (!activityHandle) {
        let open;
        const promise = self.wavewalletdkCall("subscribe", params || {})
          .then((handle) => {
            if (activityGeneration !== generation) {
              handle.close();

              return;
            }
            activityHandle = handle;
            pumpActivity(handle);
          })
          .finally(() => {
            if (activityOpen === open) {
              activityOpen = null;
            }
          });
        open = { generation, promise };
        activityOpen = open;
        await promise;
      }
      self.postMessage({ id, ok: true, result: { subscribed: true } });

      return;
    }

    if (method === "$stopActivity") {
      activityGeneration += 1;
      const handle = activityHandle;
      activityHandle = null;
      if (handle) {
        handle.close();
      }
      self.postMessage({ id, ok: true, result: { stopped: true } });

      return;
    }

    if (debug) {
      console.log(
        `${debugTs()} Executing ${method}:`,
        facadeDebugPayload(method, params),
      );
    }
    const result = await self.wavewalletdkCall(method, params || {});
    if (debug) {
      console.log(
        `${debugTs()} Executed ${method} result:`,
        facadeDebugPayload(method, result),
      );
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: String(err?.message || err),
    });
  }
};

async function ensureLoaded() {
  if (wasmReady) {
    return;
  }

  if (!loadPromise) {
    loadPromise = loadRuntime();
  }

  await loadPromise;
}

// Mirrors sha256Sri in packages/web/src/integrity.ts, including the guard:
// worker mode does not require a secure context the way OPFS persistence
// does, so a plain-HTTP host reaches this function with no crypto.subtle,
// and without the guard the digest call throws an opaque, uncoded TypeError
// instead of this actionable message.
async function sha256Sri(bytes) {
  if (!crypto?.subtle) {
    throw new Error(
      "Wavelength runtime integrity verification requires crypto.subtle, " +
        "which is only available in secure contexts (https or localhost).",
    );
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return `sha256-${btoa(binary)}`;
}

// Mirrors verifyAssetBytes in packages/web/src/integrity.ts. The "failed
// integrity verification" phrase is the wording of record for the client's
// isRuntimeIntegrityMessage; keep it in sync. A missing table entry fails
// closed.
async function verifyAssetBytes(bytes, name, url) {
  if (!assetDigests) {
    return;
  }
  const expected = assetDigests[name];
  const detail = expected
    ? `expected ${expected}`
    : `no digest pinned for ${name}`;
  if (!expected || (await sha256Sri(bytes)) !== expected) {
    throw new Error(
      `Wavelength runtime asset at ${url} failed integrity verification ` +
        `(${detail}). The hosted asset set most likely does not match the ` +
        "daemon release this SDK version is pinned to " +
        "(RUNTIME_MANIFEST_VERSION); redeploy the matching release assets.",
    );
  }
}

// Fetches, verifies, and executes a bootstrap script from a blob URL, or its
// packaged URL when both the worker and asset belong to one Chrome extension.
// importScripts has no integrity support, so the bytes are hashed by hand;
// executing from a blob also means the script cannot resolve siblings from
// its own URL, which the sqliteBridge* globals set in loadRuntime cover.
async function importVerifiedScript(name) {
  const url = resolveRuntimeAsset(name);
  // fetch() rejects on a network or CORS failure rather than resolving with a
  // non-ok response, unlike importScripts's own error handling; without this
  // catch that rejection would surface as a raw, uncoded error instead of the
  // documented asset_load_failed. The rejection rides along as the cause, the
  // way the main-thread mirror does: it is the only record of whether this was
  // DNS, a refused connection, or CORS.
  const response = await fetch(url).catch((err) => {
    throw assetLoadError(url, err);
  });
  if (!response.ok) {
    throw assetLoadError(url);
  }
  const bytes = await response.arrayBuffer().catch((err) => {
    throw assetLoadError(url, err);
  });
  await verifyAssetBytes(bytes, name, url);

  // Manifest V3 disallows blob scripts. Installed extension resources are
  // owned by the browser's package/update lifecycle, so they can execute from
  // their original URL after the same digest check. Never apply this to a web
  // URL, where a second fetch could return different bytes. Mirrors runtime.ts.
  if (isPackagedExtensionScript(url)) {
    importScripts(url);
    return;
  }
  const blobUrl = URL.createObjectURL(
    new Blob([bytes], { type: "text/javascript" }),
  );
  try {
    importScripts(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function isPackagedExtensionScript(url) {
  if (!self.location?.href) return false;
  const context = new URL(self.location.href);
  const asset = new URL(url, context);
  return context.protocol === "chrome-extension:" &&
    asset.protocol === context.protocol && asset.host === context.host &&
    context.host !== "";
}

async function loadRuntime() {
  if (typeof self.CustomEvent !== "function") {
    self.CustomEvent = class CustomEvent extends Event {
      constructor(type, params = {}) {
        super(type, params);
        this.detail = params.detail;
      }
    };
  }

  // sqlite-bridge.js derives the nested sqlite-worker.js URL from
  // document.currentScript, which does not exist in a worker; point it (and the
  // sqlite3.js URL it forwards) at the hosted copies so the nested worker and its
  // wasm load from runtimeBaseUrl rather than relative to this worker's URL.
  self.sqliteBridgeWorkerURL = resolveRuntimeAsset("sqlite-worker.js");
  self.sqliteBridgeSQLiteJSURL = resolveRuntimeAsset("sqlite3.js");

  const sqliteStartedAt = performanceEnabled ? performanceNow() : undefined;
  await importVerifiedScript("sqlite-bridge.js");
  postPerformance("sqliteBridgeScript", sqliteStartedAt, {
    transport: "worker",
  });

  const goScriptStartedAt = performanceEnabled ? performanceNow() : undefined;
  await importVerifiedScript("wasm_exec.js");
  postPerformance("wasmExecScript", goScriptStartedAt, {
    transport: "worker",
  });

  const go = new Go();
  const result = await instantiateWasm(go.importObject);
  const goReadyStartedAt = performanceEnabled ? performanceNow() : undefined;
  const runPromise = go.run(result.instance);
  // go.run() resolves if the Go program's main() ever returns and rejects if it
  // traps. Either way the daemon is gone, so signal a fatal on both: a resolve
  // that posted nothing would otherwise leave the client believing the runtime
  // was still alive, holding the cross-tab lock until the tab closed.
  runPromise.then(
    () => rejectAllPending(new Error("Wavelength runtime exited")),
    rejectAllPending,
  );

  await waitForWASMReady();
  postPerformance("goReady", goReadyStartedAt, { transport: "worker" });
}

function waitForWASMReady() {
  if (wasmReady) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    self.addEventListener("wavewalletdk-ready", () => resolve(), { once: true });
  });
}

// The runtime cache below mirrors runtime-cache.ts. This worker ships as a
// standalone file the consumer's bundler emits, so it cannot import from the
// package; keep the two in sync. See that module for why the cache exists at
// all (short version: the browser refuses to keep a 20 MB wasm module in the
// HTTP cache, so every load re-downloads it) and for the release-pruning rules.
// The bucket name carries the daemon version the bytes belong to, so an SDK
// upgrade cannot read the previous release's module back. The worker cannot
// import RUNTIME_MANIFEST_VERSION, so the client sends it in $init; with no
// version there is no safe bucket to use and caching stays off.
const RUNTIME_CACHE_PREFIX = "wavelength-runtime-";
function runtimeCacheName() {
  return runtimeVersion ? `${RUNTIME_CACHE_PREFIX}v1-${runtimeVersion}` : "";
}

function absoluteRuntimeUrl(url) {
  try {
    return new Request(url).url;
  } catch {
    return url;
  }
}

async function openRuntimeCache() {
  if (!runtimeCacheEnabled) {
    return undefined;
  }

  const name = runtimeCacheName();
  if (!name) {
    return undefined;
  }

  let caches;
  try {
    caches = self.caches;
  } catch {
    return undefined;
  }
  if (!caches) {
    return undefined;
  }

  try {
    const cache = await caches.open(name);
    void dropSupersededCaches(caches, name);

    return cache;
  } catch {
    return undefined;
  }
}

async function dropSupersededCaches(caches, keepName) {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (name) =>
            name.startsWith(RUNTIME_CACHE_PREFIX) && name !== keepName,
        )
        .map((name) => caches.delete(name)),
    );
  } catch {
    // A cache we cannot enumerate is one we cannot clean up. Harmless.
  }
}

async function storeRuntimeAsset(cache, url, response) {
  try {
    await cache.put(url, response);
  } catch {
    // An origin over quota rejects the write; there is nothing to be done.
    return false;
  }

  try {
    const keep = absoluteRuntimeUrl(url);
    const stale = (await cache.keys()).filter(
      (request) => request.url !== keep,
    );
    await Promise.all(stale.map((request) => cache.delete(request)));
  } catch {
    // Leaving a stale runtime behind costs disk, not correctness.
  }

  return true;
}

// instantiateCachedWasm instantiates a copy stored by an earlier visit, or
// returns undefined when there is nothing usable cached. The cache always
// holds decompressed wasm, whatever encoding it arrived in, so this is a
// plain read and instantiate. Cached bytes are verified against the pinned
// digest exactly like a freshly fetched response: Cache Storage is writable
// by any same-origin script, so trusting a hit unconditionally would turn it
// into a bypass for the whole feature. Bytes that fail to instantiate, or
// fail verification, are evicted and reported as a miss so a broken entry
// cannot wedge every later load.
async function instantiateCachedWasm(cache, url, path, importObject) {
  let cached;
  try {
    cached = await cache.match(url);
  } catch {
    return undefined;
  }
  if (!cached) {
    return undefined;
  }

  const readStartedAt = performanceEnabled ? performanceNow() : undefined;
  try {
    const bytes = await cached.arrayBuffer();
    postPerformance("wasmCacheRead", readStartedAt, {
      path,
      bytes: bytes.byteLength,
    });

    await verifyAssetBytes(bytes, "wavewalletdk.wasm", url);

    const compileStartedAt = performanceEnabled ? performanceNow() : undefined;
    const instantiated = await WebAssembly.instantiate(bytes, importObject);
    // Reported on success only. A miss here is not a load, it is a discarded
    // entry: the caller goes on to fetch and reports its own compile, so
    // reporting a failed one too would put a timing for abandoned work into
    // the same distribution.
    postPerformance("wasmCompileInstantiate", compileStartedAt, {
      path,
      streaming: false,
      source: "cache",
    });

    return instantiated;
  } catch (err) {
    postEvent("log", {
      level: "warn",
      message: `cached wasm load failed: ${String(err?.message || err)}`,
    });
    try {
      await cache.delete(url);
    } catch {
      // An entry we cannot delete is one the next load will retry.
    }

    return undefined;
  }
}

// The first bytes of a runtime asset say what it is, and headers cannot. A host
// may mislabel the MIME type, and Content-Encoding is not a CORS-safelisted
// response header, so cross-origin it is often invisible even when the
// transport has already decoded the body. Reading the magic number replaces
// that guess with a fact, which is what removes the recovery paths a wrong
// guess used to need. Mirrors runtime.ts; keep the two in sync.
const GZIP_MAGIC = [0x1f, 0x8b];
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

// The wasm magic is the longer of the two, so four bytes settles either.
const MAGIC_BYTES = 4;

function startsWith(bytes, magic) {
  return magic.every((byte, index) => bytes[index] === byte);
}

// peekMagic reads the first `size` bytes without disturbing the body the caller
// will use. The peek runs on a clone and cancels it once it has the magic, so
// the original stays untouched and native: wrapping it in a JS ReadableStream
// instead would put every byte of a ~130 MB module through a JS pull callback,
// which measurably slowed the cold load.
async function peekMagic(response, size) {
  const body = response.clone().body;
  if (!body) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const chunks = [];
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

  let total = 0;
  for (const chunk of chunks) {
    total += chunk.byteLength;
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }

  return joined;
}

// instantiateRuntimeAsset fetches one asset, verifies it, and instantiates it,
// inflating first when its bytes are gzip. The response's own Content-Type is
// not consulted: Content-Encoding is not a CORS-safelisted response header
// and hosts are unreliable about labelling bodies correctly, so the first
// bytes are read directly to tell gzip from raw wasm. Bytes are hashed before
// instantiation, so the full body is buffered here rather than streamed into
// the compiler: verifying a digest requires the complete ArrayBuffer, and
// there is no way to check bytes the compiler has already consumed. Mirrors
// runtime.ts; keep the two in sync.
async function instantiateRuntimeAsset(url, path, importObject) {
  const cache = await openRuntimeCache();
  if (cache) {
    const cached = await instantiateCachedWasm(cache, url, path, importObject);
    if (cached) {
      return cached;
    }
  }

  const fetchStartedAt = performanceEnabled ? performanceNow() : undefined;
  // See importVerifiedScript's matching comment: fetch() rejects on a
  // network or CORS failure instead of resolving with a non-ok response, so
  // that rejection needs converting to the documented asset_load_failed too,
  // carrying the underlying error as the cause.
  const response = await fetch(url).catch((err) => {
    throw assetLoadError(url, err);
  });
  postPerformance("wasmFetchHeaders", fetchStartedAt, { path });
  if (!response.ok || !response.body) {
    throw assetLoadError(url);
  }

  const prefix = await peekMagic(response, MAGIC_BYTES).catch((err) => {
    throw assetLoadError(url, err);
  });
  const gzipped = startsWith(prefix, GZIP_MAGIC);
  if (!gzipped && !startsWith(prefix, WASM_MAGIC)) {
    // Neither magic number: whatever this is, it is not a runtime binary.
    throw assetLoadError(url);
  }
  if (gzipped && !("DecompressionStream" in self)) {
    throw new Error(
      `Wavelength runtime asset at ${url} is gzip and this browser has no ` +
        "DecompressionStream to inflate it.",
    );
  }

  const body = gzipped
    ? response.body.pipeThrough(new DecompressionStream("gzip"))
    : response.body;

  // The digest pins the decompressed binary, so the same "wavewalletdk.wasm"
  // entry verifies bytes fetched from either the compressed or the raw URL.
  const bytes = await new Response(body).arrayBuffer().catch((err) => {
    throw assetLoadError(url, err);
  });
  await verifyAssetBytes(bytes, "wavewalletdk.wasm", url);

  const compileStartedAt = performanceEnabled ? performanceNow() : undefined;
  let instantiated;
  try {
    instantiated = await WebAssembly.instantiate(bytes, importObject);
  } catch (instantiateErr) {
    // The bytes arrived, verified, and were the right shape, so this is a
    // genuine instantiation failure rather than a missing asset or a tamper.
    // Keep it distinct from the messages isRuntimeAssetMessage and
    // isRuntimeIntegrityMessage match on, so the client does not recode it.
    throw new Error(
      `Wavelength runtime wasm failed to instantiate from ${url}: ` +
        String(instantiateErr?.message || instantiateErr),
      { cause: instantiateErr },
    );
  }
  // Reported on success only. A failed asset falls through to the next one,
  // which reports its own compile.
  postPerformance("wasmCompileInstantiate", compileStartedAt, {
    path,
    streaming: false,
    body: gzipped ? "gzip" : "wasm",
  });

  // Stored only now that the module has both verified and compiled, so bytes
  // that turn out tampered or broken can never become the entry every later
  // load reads. Not awaited: filling the cache must not slow the load that
  // fills it.
  if (cache) {
    void storeRuntimeAsset(cache, url, new Response(bytes));
  }

  return instantiated;
}

async function instantiateWasm(importObject) {
  const startedAt = performanceEnabled ? performanceNow() : undefined;
  let path = "gzip";
  // A load that threw still reports, because the time was really spent, but it
  // is tagged so a consumer can keep abandoned work out of a latency
  // distribution rather than having to infer the failure from the duration.
  let outcome = "success";
  try {
    try {
      return await instantiateRuntimeAsset(
        resolveRuntimeAsset("wavewalletdk.wasm.gz"),
        "gzip",
        importObject,
      );
    } catch (err) {
      // An integrity mismatch must not fall back: the raw path would refetch
      // the same content from the same origin, turning a tamper signal into
      // a confusing second failure. The phrase is the wording of record
      // shared with the client's isRuntimeIntegrityMessage.
      if (/failed integrity verification/i.test(String(err?.message || err))) {
        throw err;
      }
      // A body-read failure (a dropped connection after headers arrived) is
      // reported through the same generic asset_load_failed message as a
      // missing host, so surface the underlying cause here too, when there
      // is one, rather than losing the actual reason on every gzip fallback.
      // Unlike the main thread's errorMessage(), String(x.message || x) can
      // never resolve to "": an empty cause.message just falls through to
      // stringifying the cause object itself. So this stays a plain
      // truthiness check, with no empty-string guard to mirror the TS side.
      const detail = err?.cause
        ? ` (${String(err.cause?.message || err.cause)})`
        : "";
      postEvent("log", {
        level: "warn",
        message: `compressed wasm load failed: ${String(err?.message || err)}${detail}`,
      });
      path = "raw";
    }

    return await instantiateRuntimeAsset(
      resolveRuntimeAsset("wavewalletdk.wasm"),
      "raw",
      importObject,
    );
  } catch (err) {
    outcome = "error";
    throw err;
  } finally {
    postPerformance("wasmTotal", startedAt, { path, outcome });
  }
}

// pumpActivity drains the subscription handle, forwarding each entry to the
// main thread until the stream ends (next() resolves null) or $stopActivity
// swaps the handle out.
async function pumpActivity(handle) {
  try {
    for (
      let entry = await handle.next();
      entry !== null && activityHandle === handle;
      entry = await handle.next()
    ) {
      postEvent("activity", entry);
    }
    // A stream that ends while this is still the active handle was not closed
    // by $stopActivity; signal it so the host can resubscribe. A handle
    // swapped out by $stopActivity is an expected close and stays silent.
    if (activityHandle === handle) {
      activityHandle = null;
      postEvent("activityStream", { state: "ended" });
    }
  } catch (err) {
    // An error after a client-initiated close is expected; only surface a
    // failure the consumer did not cause.
    if (activityHandle === handle) {
      activityHandle = null;
      postEvent("activityStream", {
        state: "failed",
        message: String(err?.message || err),
      });
    }
  }
}

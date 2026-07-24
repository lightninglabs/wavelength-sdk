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

// debug mirrors the client's debug option, set from the $init message. When on,
// every RPC request/response is logged - payloads can include addresses and
// amounts, so it stays off unless the consumer opts in.
let debug = false;
let performanceEnabled = false;
function debugTs() {
  return new Date().toISOString().split("T").join(" ").slice(0, -1);
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
    debug = !!data.$init.debug;
    performanceEnabled = !!data.$init.performance;

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
      console.log(`${debugTs()} Executing ${method}:`, params);
    }
    const result = await self.wavewalletdkCall(method, params || {});
    if (debug) {
      console.log(`${debugTs()} Executed ${method} result:`, result);
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
  importScripts(resolveRuntimeAsset("sqlite-bridge.js"));
  postPerformance("sqliteBridgeScript", sqliteStartedAt, {
    transport: "worker",
  });

  const goScriptStartedAt = performanceEnabled ? performanceNow() : undefined;
  importScripts(resolveRuntimeAsset("wasm_exec.js"));
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
    void reader.cancel();
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

// instantiateRuntimeAsset fetches one asset and instantiates it, inflating
// first when its bytes are gzip. The response's own Content-Type is not
// consulted: instantiateStreaming requires application/wasm and hosts are
// unreliable about sending it, so the body is rewrapped in a response labelled
// here. That also keeps the compressed path streaming.
async function instantiateRuntimeAsset(url, path, importObject) {
  const fetchStartedAt = performanceEnabled ? performanceNow() : undefined;
  const response = await fetch(url);
  postPerformance("wasmFetchHeaders", fetchStartedAt, { path });
  if (!response.ok || !response.body) {
    throw new Error(
      `Wavelength runtime asset could not be loaded from ${url}. Host the ` +
        "daemon runtime assets and point runtimeBaseUrl at them.",
    );
  }

  const prefix = await peekMagic(response, MAGIC_BYTES);
  const gzipped = startsWith(prefix, GZIP_MAGIC);
  if (!gzipped && !startsWith(prefix, WASM_MAGIC)) {
    // Neither magic number: whatever this is, it is not a runtime binary.
    throw new Error(
      `Wavelength runtime asset could not be loaded from ${url}. Host the ` +
        "daemon runtime assets and point runtimeBaseUrl at them.",
    );
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

  const compileStartedAt = performanceEnabled ? performanceNow() : undefined;
  let instantiated;
  try {
    instantiated = await WebAssembly.instantiateStreaming(
      new Response(body, { headers: { "content-type": "application/wasm" } }),
      importObject,
    );
  } catch (instantiateErr) {
    // The bytes arrived and were the right shape, so this is a genuine
    // instantiation failure rather than a missing asset. Keep it distinct from
    // the message isRuntimeAssetMessage matches on, so the client does not
    // recode it as asset_load_failed.
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
    streaming: true,
    body: gzipped ? "gzip" : "wasm",
  });

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
      postEvent("log", {
        level: "warn",
        message: `compressed wasm load failed: ${String(err?.message || err)}`,
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

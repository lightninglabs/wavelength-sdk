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
function debugTs() {
  return new Date().toISOString().split("T").join(" ").slice(0, -1);
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
  // go.run() rejecting means the daemon runtime has exited; signal the main
  // thread so it can reject every in-flight RPC instead of hanging forever.
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

  importScripts(resolveRuntimeAsset("sqlite-bridge.js"));
  importScripts(resolveRuntimeAsset("wasm_exec.js"));

  const go = new Go();
  const result = await instantiateWasm(go.importObject);
  const runPromise = go.run(result.instance);
  runPromise.catch(rejectAllPending);

  await waitForWASMReady();
}

function waitForWASMReady() {
  if (wasmReady) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    self.addEventListener("wavewalletdk-ready", () => resolve(), { once: true });
  });
}

async function instantiateWasm(importObject) {
  if ("DecompressionStream" in self) {
    try {
      return await instantiateCompressedWasm(importObject);
    } catch (err) {
      postEvent("log", {
        level: "warn",
        message: `compressed wasm load failed: ${String(err?.message || err)}`,
      });
    }
  }

  return instantiateRawWasm(importObject);
}

async function instantiateCompressedWasm(importObject) {
  const url = resolveRuntimeAsset("wavewalletdk.wasm.gz");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Wavelength runtime asset could not be loaded from ${url}. Host the ` +
        "daemon runtime assets and point runtimeBaseUrl at them.",
    );
  }

  if (!response.body) {
    throw new Error(`Wavelength compressed wasm response from ${url} is empty.`);
  }

  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const bytes = await new Response(stream).arrayBuffer();

  return WebAssembly.instantiate(bytes, importObject);
}

async function instantiateRawWasm(importObject) {
  const url = resolveRuntimeAsset("wavewalletdk.wasm");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Wavelength runtime asset could not be loaded from ${url}. Host the ` +
        "daemon runtime assets and point runtimeBaseUrl at them.",
    );
  }

  try {
    return await WebAssembly.instantiateStreaming(response, importObject);
  } catch {
    // instantiateStreaming requires the host to serve the wasm as
    // application/wasm; fall back to ArrayBuffer instantiation so a
    // misconfigured MIME type does not break self-hosted runtimes.
    const retry = await fetch(url);
    if (!retry.ok) {
      throw new Error(
        `Wavelength runtime asset could not be loaded from ${url}. Host the ` +
          "daemon runtime assets and point runtimeBaseUrl at them.",
      );
    }
    const bytes = await retry.arrayBuffer();
    return WebAssembly.instantiate(bytes, importObject);
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

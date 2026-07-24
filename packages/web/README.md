# @lightninglabs/wavelength-web

The browser transport for [Wavelength](https://wavelength.lightning.engineering): embed a self-custodial
Lightning wallet directly in a web app. Your users send and receive Lightning
payments with no node to run, no channels to open, and no inbound liquidity to
manage, while their keys stay on their own device. The wallet runs entirely in
the browser as WebAssembly, so there is no backend to operate and nothing
listening on a socket.

This package is framework-agnostic: use it from vanilla JS, Vue, Svelte, or
React. It re-exports every type from [`@lightninglabs/wavelength-core`](https://www.npmjs.com/package/@lightninglabs/wavelength-core),
so you import the client and its types from one place. For React, pair it with
[`@lightninglabs/wavelength-react`](https://www.npmjs.com/package/@lightninglabs/wavelength-react).

## Install

```sh
npm install @lightninglabs/wavelength-web
```

## Quick start

`createWebWalletEngine()` builds a `WalletEngine` backed by the in-browser
wallet runtime. `runtimeBaseUrl` points at the hosted wasm runtime asset set
(see below).

```ts
import { createWebWalletEngine, defaultConfig } from "@lightninglabs/wavelength-web";

const engine = createWebWalletEngine({
  runtimeBaseUrl: "https://your-host/wavewalletdk/",
  config: defaultConfig("signet"),
  autoStart: true,
});
```

If you want the client directly rather than the engine, use `createWebClient()`:

```ts
import { createWebClient, defaultConfig, WalletState } from "@lightninglabs/wavelength-web";

const client = createWebClient({ runtimeBaseUrl: "https://your-host/wavewalletdk/" });
await client.ready();
await client.start(defaultConfig("signet"));
```

## Performance diagnostics

`onPerformance` opts a client or engine into structured timing samples. The
callback covers runtime fetch, gzip decompression, WebAssembly compilation, Go
startup, wallet create/unlock RPCs, post-RPC `getInfo` adoption, sync polling,
and passkey ceremonies. When the callback is absent, the transport does not
collect or send timing samples.

```ts
import {
  createWebPasskeyCeremony,
  createWebWalletEngine,
  type WavelengthPerformanceEvent,
} from "@lightninglabs/wavelength-web";

const report = (sample: WavelengthPerformanceEvent) => {
  console.debug("wavelength timing", sample);
};

const engine = createWebWalletEngine({
  runtimeBaseUrl: "https://your-host/wavewalletdk/",
  onPerformance: report,
});

const passkeys = createWebPasskeyCeremony({ onPerformance: report });
```

Reporters are diagnostics. An exception thrown by the callback is swallowed so
it cannot break wallet work. Samples use low-cardinality metadata and do not
contain passwords, passkey output, addresses, or amounts.

## Runtime assets

The wallet runtime ships as a set of files (`RUNTIME_ASSET_FILES`) that you host
yourself and point `runtimeBaseUrl` at. Obtain the set either from the
`wavelength` release assets or by building it from a `wavelength` checkout; see
the [documentation](https://wavelength.lightning.engineering) for the exact
steps.

Serve `wavewalletdk.wasm.gz` with `Content-Type: application/wasm` and
`Content-Encoding: gzip`. The browser can then decompress and compile the
module through one native streaming pipeline. Hosts that serve the file as
`application/gzip` still work: the SDK falls back to `DecompressionStream` and
buffered compilation. Keep the raw `wavewalletdk.wasm` asset beside it as the
fallback for browsers without gzip stream support.

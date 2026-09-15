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
startup, wallet create/unlock RPCs, post-RPC `getInfo` adoption, and sync
polling. Passkey ceremonies are separate: the client and engine never run one,
so pass the same callback to `createWebPasskeyCeremony({ onPerformance })` and
use the ceremony it returns. When the callback is absent, the transport does
not collect or send timing samples.

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
[wavelength release assets](https://github.com/lightninglabs/wavelength/releases)
or by building it from a `wavelength` checkout; see
[Hosting runtime assets](https://wavelength.lightning.engineering/web/get-started/hosting-runtime-assets/)
for the exact steps.

Serve `wavewalletdk.wasm.gz` however your host makes easiest. The SDK reads the
first bytes of the response and branches on the magic number rather than on
`Content-Type` or `Content-Encoding`, so a compressed body, an
already-inflated one, and a generic `application/gzip` label all load the same
way and all stay on the compressed asset.

Keep the raw `wavewalletdk.wasm` asset beside it. It is the fallback when the
compressed one cannot be fetched, and for browsers with no
`DecompressionStream`.

**Integrity verification.** The transport verifies the wasm binary and its
bootstrap scripts against SHA-256 digests pinned for the SDK's release before
executing them, on by default. A mismatch throws `WavelengthError` with code
`asset_integrity_failed`, most likely because the hosted asset set does not
match the SDK release. Set `runtimeIntegrity: false` to skip verification for
a runtime you built from source. `RUNTIME_ASSET_DIGESTS` exports the full
digest table so you can also verify your hosted set at deploy time. If your
web app sets a Content-Security-Policy, `script-src` must include `blob:`
alongside `'self'`, since the SDK executes its bootstrap scripts from blob
URLs.

Chrome extensions package the runtime assets inside their own extension and
set `runtimeBaseUrl: chrome.runtime.getURL('runtime/')`. For this same-extension
case, both runtime modes verify the bootstrap scripts and then execute their
packaged URLs, compatible with Manifest V3's `script-src 'self'
'wasm-unsafe-eval'`. Web URLs and other extension origins retain blob execution.
This exception relies on the browser owning the installed package and its update
lifecycle; it is not a general verify-then-refetch path for mutable web assets.
OPFS also needs cross-origin isolation and a suitable worker owner. See the
[extension probe](../../apps/web-wallet-demo/extension-probe/README.md) for the
manifest, executable recovery tests and remaining lifecycle limitations.

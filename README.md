# Wavelength SDK

A TypeScript SDK for embedding a self-custodial Lightning wallet directly in
your app, on the web and on mobile. Your users send and receive Lightning
payments with no node to run, no channels to open, and no inbound liquidity to
manage, while the keys stay on their own device. The wallet runs entirely
in-process: as WebAssembly in the browser, or as a native module compiled into
a React Native app. There is no backend to operate and nothing listening on a
socket; your app drives the wallet through a small, typed client.

Full documentation lives at
[wavelength.lightning.engineering](https://wavelength.lightning.engineering).

## How it fits together

The SDK is a typed client over the
[wavelength](https://github.com/lightninglabs/wavelength) wallet daemon, which
is compiled to WebAssembly for the browser and via gomobile for iOS and
Android. The SDK loads that runtime and exposes it as the `WavelengthClient`
contract plus a framework-agnostic `WalletEngine`.

Each SDK release pairs with a pinned wavelength release (the
`RUNTIME_MANIFEST_VERSION` that `@lightninglabs/wavelength-core` exports).
That release is where the runtime artifacts come from: the wasm asset set for
the web and the native binaries for React Native. See
[Runtime assets and native bindings](#runtime-assets-and-native-bindings).

## Packages

| Package | What it is |
|---|---|
| [`@lightninglabs/wavelength-core`](packages/core) | The contract: types, the `WavelengthClient` interface, the `WalletEngine`, errors, and enums. No DOM, no transport. |
| [`@lightninglabs/wavelength-web`](packages/web) | The browser (wasm) transport. Framework-agnostic: use it directly from vanilla JS, Vue, Svelte, or React. Re-exports `core`. |
| [`@lightninglabs/wavelength-react-native`](packages/react-native) | The React Native transport: a Turbo Module wrapping the wallet runtime compiled into the app binary. Re-exports `core`. |
| [`@lightninglabs/wavelength-react`](packages/react) | React provider + hooks. Transport-agnostic: the same binding runs over the web and React Native transports. |

`wavelength-web` and `wavelength-react-native` each re-export every type from
`core`, so an app imports the client and its types from one place.

## Apps

None of these are published; they live in the repository as reference code and
verification harnesses.

| App | What it is |
|---|---|
| [`apps/web-wallet-demo`](apps/web-wallet-demo) | The reference web app, plus the Playwright smoke test. |
| [`apps/rn-wallet-demo`](apps/rn-wallet-demo) | The reference React Native app: an Expo dev-client demo mirroring the web demo screen for screen. |
| [`apps/docs`](apps/docs) | The documentation site, published at [wavelength.lightning.engineering](https://wavelength.lightning.engineering). |

## Install

```sh
# React on the web (the binding + the web transport)
npm install @lightninglabs/wavelength-react @lightninglabs/wavelength-web

# React Native (the binding + the native transport)
npm install @lightninglabs/wavelength-react @lightninglabs/wavelength-react-native

# Vanilla / Vue / Svelte (web transport only)
npm install @lightninglabs/wavelength-web
```

You build the engine with `createWebWalletEngine()` from `wavelength-web` or
`createNativeWalletEngine()` from `wavelength-react-native`. In React you pass
that engine to `WavelengthProvider`; the provider itself is transport-agnostic
and works the same way with either.

## Quickstart: web

```tsx
import {
  WavelengthProvider,
  useWallet,
  useWalletBalance,
  useWalletSend,
} from "@lightninglabs/wavelength-react";
import { createWebWalletEngine, defaultConfig } from "@lightninglabs/wavelength-web";

// Build the engine once. runtimeBaseUrl points at the hosted wasm runtime
// assets (see below). config + autoStart boot the embedded wallet as soon as
// the wasm runtime is ready.
const engine = createWebWalletEngine({
  runtimeBaseUrl: "https://your-host/wavewalletdk/",
  config: defaultConfig("signet"),
  autoStart: true,
});

function Root() {
  return (
    <WavelengthProvider engine={engine}>
      <Wallet />
    </WavelengthProvider>
  );
}

function Wallet() {
  const { phase } = useWallet();
  const balance = useWalletBalance();
  const { send } = useWalletSend();

  if (phase !== "ready") return <p>Loading… ({phase})</p>;

  return (
    <div>
      <p>Spendable: {balance?.confirmedSat ?? 0} sats</p>
      <button onClick={() => send({ invoice: "lnbc…" })}>Pay</button>
    </div>
  );
}
```

Focused hooks are available when you only need a slice. State-reading hooks
like `useWalletBalance()` and `useWalletActivity()` return their value directly.
Mutation hooks like `useWalletSend()`, `useWalletReceive()`, and `useWalletDeposit()`
each expose an action plus verb-prefixed state, e.g. `useWalletSend()` returns
`{ send, sendPending, sendError, sendData, resetSend }`.

Using the client directly from vanilla JS, Vue, or Svelte instead of React is
the same flow without the provider; see the
[`wavelength-web` README](packages/web) for that quickstart.

## Quickstart: React Native

The same provider and hooks run over the native transport; only the engine
factory changes:

```tsx
import { WavelengthProvider, useWallet } from "@lightninglabs/wavelength-react";
import { createNativeWalletEngine } from "@lightninglabs/wavelength-react-native";

const engine = createNativeWalletEngine();

export default function App() {
  return (
    <WavelengthProvider engine={engine}>
      <Wallet />
    </WavelengthProvider>
  );
}
```

React Native has platform requirements the web does not: the package is New
Architecture only, Expo apps need a development build rather than Expo Go, and
the native runtime binaries are staged separately from npm. The
[`wavelength-react-native` README](packages/react-native) covers all of it.

## Configuration

`defaultConfig(network)` returns a ready-to-use config preloaded with the
canonical public endpoints for `signet` and `testnet`. Override only
what you need:

```ts
import { defaultConfig } from "@lightninglabs/wavelength-web";

defaultConfig("signet");
defaultConfig("signet", { dataDir: "my-wallet" });
```

Each transport exports its own `defaultConfig`, preloaded with the endpoint
flavor it speaks: on the web, `arkServerAddress` and `swapServerAddress` are
REST URLs; on React Native they are gRPC endpoints. `walletEsploraUrl` is an
HTTP Esplora endpoint on every platform.

There is no regtest preset (local ports vary per machine); build that config
by hand with your stack's endpoints and the insecure-transport flags:

```ts
import type { RuntimeConfig } from "@lightninglabs/wavelength-web";

const config: RuntimeConfig = {
  network: "regtest",
  arkServerAddress: "http://127.0.0.1:7071",
  walletEsploraUrl: "http://127.0.0.1:8501",
  swapServerAddress: "http://127.0.0.1:10032",
  arkServerInsecure: true,
  swapServerInsecure: true,
};
```

Every field is documented on the [`RuntimeConfig`](packages/core/src/config.ts)
type. `mainnet` has no public preset yet, so like regtest it is built by hand:
supply the endpoints and `allowMainnet: true` yourself.

## Runtime assets and native bindings

Both runtime artifacts come from the pinned
[wavelength release](https://github.com/lightninglabs/wavelength/releases);
neither ships inside an npm package.

### Web: wasm runtime assets

The wasm runtime ships as a set of files (`RUNTIME_ASSET_FILES`) that make up
the in-browser wallet. Host them together at one base URL and point
`runtimeBaseUrl` at it:

```ts
import { RUNTIME_ASSET_FILES } from "@lightninglabs/wavelength-web";
// → wavewalletdk.wasm.gz, wasm_exec.js, sqlite-*.js, …
```

You host the asset set yourself. Obtain it from the wavelength release assets,
or build it from a `wavelength` checkout. See
[Hosting runtime assets](https://wavelength.lightning.engineering/web/get-started/hosting-runtime-assets/)
for the exact steps.

Serve `wavewalletdk.wasm.gz` however your host makes easiest. The SDK reads the
first bytes of the response to tell gzip from wasm rather than trusting
`Content-Type` or `Content-Encoding`, so no particular header setup is needed
and compilation streams either way. Keep the uncompressed `wavewalletdk.wasm`
beside it as the fallback.

### React Native: native binaries

The native wallet runtime (`Wavewalletdk.aar` for Android,
`Wavewalletdk.xcframework` for iOS) is staged into the installed
`wavelength-react-native` package before the first native build. Download the
binaries from the wavelength release, or, from a checkout of this repository,
let the package's `bindings:fetch` script stage them for you. See
[Installation](https://wavelength.lightning.engineering/react-native/get-started/installation/)
for the exact steps.

## Development

This is a pnpm workspace. Build before typechecking: the workspace typecheck
resolves cross-package imports through each package's built `dist/`.

```sh
pnpm install
pnpm build
pnpm typecheck
```

The two demo apps are the reference integrations and the manual verification
surface; each has a README covering setup and the runtime artifacts it needs
([web](apps/web-wallet-demo), [React Native](apps/rn-wallet-demo)). The docs
site has its own [README](apps/docs) as well.

## Browser performance benchmark

The web demo has a repeatable Playwright benchmark for runtime readiness, wallet
creation, reload, and unlock. It creates a fresh browser context and wallet for
each run, discards a warm-up run so a cold page cache does not decide the
result, reports p50/p95 timings, and fails when a metric exceeds
[`perf-budget.json`](apps/web-wallet-demo/perf-budget.json) or `getInfo`
adoption needs more than one attempt.

```sh
# Stage the pinned runtime release, then run five samples.
pnpm --filter web-wallet-demo run wasm:fetch
pnpm perf:web

# Or benchmark a local Wavelength checkout.
WAVELENGTH_DIR=/path/to/wavelength \
  pnpm --filter web-wallet-demo run wasm:local
pnpm perf:web

# Increase the sample count or write the JSON report elsewhere.
WAVELENGTH_PERF_RUNS=20 \
WAVELENGTH_PERF_REPORT=/tmp/wavelength-perf.json \
pnpm perf:web
```

The default report is
`apps/web-wallet-demo/test-results/wavelength-perf.json`. The checked-in budget
is a regression guard for the local Chromium profile, not a cross-device
service-level objective. Record the browser version and host when comparing
results across machines.

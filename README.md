# Wavelength

A TypeScript/React SDK for embedding a self-custodial Lightning wallet directly
in a web app. Your users send and receive Lightning payments with no node to
run, no channels to open, and no inbound liquidity to manage, while the keys
stay on their own device. The wallet runs entirely in the browser as
WebAssembly: there is no backend to operate and nothing listening on a socket.
Your app drives it through a small, typed client.

> **Status: pre-release.** APIs may still change before the first published
> version.

## Packages

| Package | What it is |
|---|---|
| [`@lightninglabs/wavelength-core`](packages/core) | The contract: types, the `WavelengthClient` interface, errors, and enums. No DOM, no transport. |
| [`@lightninglabs/wavelength-web`](packages/web) | The browser (wasm) transport. Framework-agnostic: use it directly from vanilla JS, Vue, Svelte, or React. Re-exports `core`. |
| [`@lightninglabs/wavelength-react-native`](packages/react-native) | The React Native transport. Re-exports `core`. |
| [`@lightninglabs/wavelength-react`](packages/react) | React provider + hooks. |

`wavelength-react` is transport-agnostic: it depends only on `core` and takes an
injected engine, so the same binding runs over both the web and React Native
transports. `wavelength-web` and `wavelength-react-native` each re-export every
type from `core`, so an app imports the client and its types from one place.

## Install

```sh
# React (the binding + the web transport)
npm install @lightninglabs/wavelength-react @lightninglabs/wavelength-web

# Vanilla / Vue / Svelte (transport only)
npm install @lightninglabs/wavelength-web
```

You build the engine with `createWebWalletEngine()` from `wavelength-web` (or
`createNativeWalletEngine()` from `wavelength-react-native` on mobile). In React
you pass that engine to `WavelengthProvider`; the provider itself is
transport-agnostic and works the same way with either.

## Quickstart: React

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
  runtimeBaseUrl: "https://your-host/wavelength/",
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

## Quickstart: vanilla / other frameworks

```ts
import {
  createWebClient,
  defaultConfig,
  WalletState,
} from "@lightninglabs/wavelength-web";

const client = createWebClient({ runtimeBaseUrl: "https://your-host/wavelength/" });

await client.ready();                       // wasm runtime loaded
await client.start(defaultConfig("signet")); // boot the embedded wallet

const info = await client.getInfo();
if (info.walletState === WalletState.None) {
  const { mnemonic } = await client.createWallet({ password: "…" });
  // back up `mnemonic`
}

const balance = await client.balance();
const { invoice } = await client.receive({ amountSat: 1000 });
```

## Configuration

`defaultConfig(network)` returns a ready-to-use config preloaded with the
canonical public endpoints for `signet`, `testnet`, and `testnet4`. Override only
what you need:

```ts
import { defaultConfig } from "@lightninglabs/wavelength-web";

defaultConfig("signet");
defaultConfig("signet", { dataDir: "my-wallet" });
```

There is no regtest preset (local ports vary per machine); build that config
by hand with your stack's endpoints and the insecure-transport flags:

```ts
const config = {
  network: "regtest",
  arkServerUrl: "http://localhost:7071",
  esploraUrl: "http://localhost:3002",
  swapServerUrl: "http://localhost:10032",
  serverInsecure: true,
  swapServerInsecure: true,
};
```

Every field is documented on the [`RuntimeConfig`](packages/core/src/config.ts)
type. `mainnet` has no public preset yet, so like regtest it is built by hand:
supply the endpoints and `allowMainnet: true` yourself.

## Runtime assets

The wasm runtime ships as a set of files (`RUNTIME_ASSET_FILES`) that make up the
in-browser wallet. Host them together at one base URL and point `runtimeBaseUrl`
at it:

```ts
import { RUNTIME_ASSET_FILES } from "@lightninglabs/wavelength-web";
// → wavewalletdk.wasm.gz, wasm_exec.js, sqlite-*.js, …
```

> A versioned public CDN that `runtimeBaseUrl` defaults to is on the way; until
> then, self-host the asset set.

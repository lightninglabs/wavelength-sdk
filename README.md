# WalletDK

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
| [`@lightninglabs/walletdk-core`](packages/core) | The contract: types, the `WalletDKClient` interface, errors, and enums. No DOM, no transport. |
| [`@lightninglabs/walletdk-web`](packages/web) | The browser (wasm) transport. Framework-agnostic: use it directly from vanilla JS, Vue, Svelte, or React. Re-exports `core`. |
| [`@lightninglabs/walletdk-react-native`](packages/react-native) | The React Native transport. Re-exports `core`. |
| [`@lightninglabs/walletdk-react`](packages/react) | React provider + hooks. |

`walletdk-react` is transport-agnostic: it depends only on `core` and takes an
injected client, so the same binding runs over both the web and React Native
transports. `walletdk-web` and `walletdk-react-native` each re-export every
type from `core`, so an app imports the client and its types from one place.

## Install

```sh
# React (the binding + the web transport)
npm install @lightninglabs/walletdk-react @lightninglabs/walletdk-web

# Vanilla / Vue / Svelte (transport only)
npm install @lightninglabs/walletdk-web
```

You build the client with `createWebClient()` from `walletdk-web` (or
`createNativeClient()` from `walletdk-react-native` on mobile). In React you
pass that client to `WalletDKProvider`; the provider itself is
transport-agnostic and works the same way with either.

## Quickstart: React

```tsx
import {
  WalletDKProvider,
  useWalletDK,
  defaultConfig,
} from "@lightninglabs/walletdk-react";
import { createWebClient } from "@lightninglabs/walletdk-web";
import { useEffect } from "react";

// Build the client once. runtimeBaseUrl points at the hosted wasm runtime
// assets (see below).
const client = createWebClient({ runtimeBaseUrl: "https://your-host/walletdk/" });

function Root() {
  return (
    <WalletDKProvider client={client}>
      <Wallet />
    </WalletDKProvider>
  );
}

function Wallet() {
  const wallet = useWalletDK();

  // Boot the embedded wallet once the wasm runtime is ready.
  useEffect(() => {
    if (wallet.phase === "runtimeReady") {
      wallet.start(defaultConfig("signet")).catch(() => {});
    }
  }, [wallet.phase]);

  if (wallet.phase !== "ready") return <p>Loading… ({wallet.phase})</p>;

  return (
    <div>
      <p>Spendable: {wallet.balance?.confirmedSat ?? 0} sats</p>
      <button onClick={() => wallet.send({ invoice: "lnbc…" })}>Pay</button>
    </div>
  );
}
```

Focused hooks are available when you only need a slice: `useWalletBalance()`,
`useSend()`, `useReceive()`, `useDepositAddress()`, `useWalletActivity()`, each
exposing flat `{ busy, error, clearError }` for its operation.

## Quickstart: vanilla / other frameworks

```ts
import {
  createWebClient,
  defaultConfig,
  WalletState,
} from "@lightninglabs/walletdk-web";

const client = createWebClient({ runtimeBaseUrl: "https://your-host/walletdk/" });

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
canonical public endpoints for `signet`, `testnet`, and `regtest`. Override only
what you need:

```ts
import { defaultConfig } from "@lightninglabs/walletdk-web";

defaultConfig("signet");
defaultConfig("signet", { dataDir: "my-wallet" });
defaultConfig("regtest", { esploraUrl: "http://localhost:3002" });
```

Every field is documented on the [`RuntimeConfig`](packages/core/src/config.ts)
type. `mainnet` has no public preset yet; supply the endpoints and
`allowMainnet: true` yourself.

## Runtime assets

The wasm runtime ships as a set of files (`RUNTIME_ASSET_FILES`) that make up the
in-browser wallet. Host them together at one base URL and point `runtimeBaseUrl`
at it:

```ts
import { RUNTIME_ASSET_FILES } from "@lightninglabs/walletdk-web";
// → walletdk.wasm.gz, wasm_exec.js, sqlite-*.js, …
```

> A versioned public CDN that `runtimeBaseUrl` defaults to is on the way; until
> then, self-host the asset set.

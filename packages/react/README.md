# @lightninglabs/wavelength-react

React provider and hooks for [Wavelength](https://wavelength.lightning.engineering): embed a
self-custodial Lightning wallet directly in your app. Your users send and
receive Lightning payments with no node to run, no channels to open, and no
inbound liquidity to manage, while their keys stay on their own device.

This package is transport-agnostic. It depends only on
[`@lightninglabs/wavelength-core`](https://www.npmjs.com/package/@lightninglabs/wavelength-core) and takes an injected engine, so the
same binding runs over both the web and React Native transports. Build the
engine with the transport you use, and pass it to `WavelengthProvider`.

## Install

```sh
# Web (React + the browser transport)
npm install @lightninglabs/wavelength-react @lightninglabs/wavelength-web
```

On React Native, install
[`@lightninglabs/wavelength-react-native`](https://www.npmjs.com/package/@lightninglabs/wavelength-react-native) instead of the web
transport.

## Quick start

```tsx
import { WavelengthProvider, useWallet, useWalletBalance, useWalletSend } from "@lightninglabs/wavelength-react";
import { createWebWalletEngine, defaultConfig } from "@lightninglabs/wavelength-web";

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

State-reading hooks like `useWalletBalance()` and `useWalletActivity()` return
their value directly. Mutation hooks like `useWalletSend()`,
`useWalletReceive()`, and `useWalletDeposit()` each expose an action plus
verb-prefixed state, for example `useWalletSend()` returns
`{ send, sendPending, sendError, sendData, resetSend }`. `useWalletEngine()` is
the escape hatch for anything the hooks don't cover.

See the [documentation](https://wavelength.lightning.engineering) for the full
hook reference.

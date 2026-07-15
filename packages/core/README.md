# @lightninglabs/wavelength-core

The contract at the base of the [Wavelength](https://wavelength.lightning.engineering) SDK: a
self-custodial Lightning wallet you embed directly in your app, so your users
send and receive Lightning payments with no node to run, no channels to open,
and no inbound liquidity to manage, while their keys stay on their own device.

This package is transport- and framework-agnostic. It carries the
`WavelengthClient` interface, the request/response types, `RuntimeConfig` and
its per-network endpoint defaults, the errors and enums, and the generated
daemon types. It has no DOM and no transport of its own.

You usually don't install this package directly. Each transport re-exports
everything here, so an app imports the client and its types from one place:

- [`@lightninglabs/wavelength-web`](https://www.npmjs.com/package/@lightninglabs/wavelength-web) for the browser (WebAssembly).
- [`@lightninglabs/wavelength-react-native`](https://www.npmjs.com/package/@lightninglabs/wavelength-react-native) for React Native.

Install it on its own only when you need the types or the client contract
without a transport, for example in shared code:

```sh
npm install @lightninglabs/wavelength-core
```

```ts
import type { WavelengthClient, RuntimeConfig } from "@lightninglabs/wavelength-core";
```

See the [documentation](https://wavelength.lightning.engineering) for the full
API reference.

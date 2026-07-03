# @lightninglabs/walletdk-react-native

The React Native transport for [WalletDK](../../README.md): embed a
self-custodial Lightning wallet directly in your app. Your users send and
receive Lightning payments with no node to run, no channels to open, and no
inbound liquidity to manage, while the keys stay on their own device. The
wallet runtime is compiled into the app binary, so there is no backend to
operate and nothing listening on a socket. Your app drives it through the
same typed client contract as the web transport.

> **Status: pre-release.** APIs may still change before the first published
> version.

## Requirements

- React Native 0.76 or newer, with the **New Architecture enabled**. This
  package is New Architecture only; it does not support the legacy
  architecture.
- iOS 15.1+.
- Android minSdk 24.
- Expo apps need a **development build**, not Expo Go: the native wallet
  runtime is a compiled module that Expo Go cannot load.

## Install

```sh
npm install @lightninglabs/walletdk-react-native @lightninglabs/walletdk-react
```

The native wallet runtime binaries currently ship out of band rather than
inside the npm package; hosted distribution is coming. Until then, build
them yourself with `scripts/fetch-bindings.sh` from a source checkout and
stage them into this package before running `pod install` / a Gradle build.

## Quick start

```tsx
import { WalletDKProvider, useWalletDK } from '@lightninglabs/walletdk-react';
import { createNativeClient } from '@lightninglabs/walletdk-react-native';

export default function App() {
  return (
    <WalletDKProvider createClient={createNativeClient}>
      <Wallet />
    </WalletDKProvider>
  );
}
```

`createNativeClient()` builds a client backed by the wallet runtime compiled
into your app; pass it to `WalletDKProvider` and use the same hooks
(`useWalletDK`, `useWalletBalance`, `useSend`, `useReceive`,
`useDepositAddress`, `useWalletActivity`) documented in
[`@lightninglabs/walletdk-react`](../react).

## Known limitations

- Passkey flows (`usePasskeyWallet`) are **web-only** for now. They rely on
  a WebAuthn ceremony this transport does not yet implement.
- Wallet runtime logs go to the platform log (Android logcat, iOS os_log),
  not to JS-visible events. Use your platform's native log viewer while
  debugging.

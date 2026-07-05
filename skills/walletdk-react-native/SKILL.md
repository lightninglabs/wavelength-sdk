---
name: walletdk-react-native
description: Embed a self-custodial Lightning wallet in a React Native or Expo app with the WalletDK SDK (@lightninglabs/walletdk-react-native, @lightninglabs/walletdk-react). Use when integrating WalletDK into a React Native or Expo app, creating a native wallet client, sending or receiving Lightning payments on device, wiring WalletDKProvider with a native factory, or adding native passkey protection. Triggers include "walletdk react native", "createNativeClient", "embed a Lightning wallet in React Native", "createNativePasskeyCeremony", and "Expo wallet".
---

# WalletDK React Native integration

WalletDK embeds a self-custodial Lightning wallet in a React Native or Expo
app. The wallet daemon is compiled directly into the app binary; there is no
node to run, no backend to operate, and nothing listening on a socket.

Docs index: https://dadocs.lightning.engineering/llms.txt. Every docs page
has a markdown twin at the same URL with `.md` appended; fetch those.

## Packages

Check the npm registry for current versions; do not rely on memorized ones.

- `@lightninglabs/walletdk-react-native`: the native transport. A Turbo
  Module wrapping the wallet runtime compiled into the app binary.
  `createNativeClient()` is the factory. Re-exports everything from core.
- `@lightninglabs/walletdk-react`: `<WalletDKProvider>` plus hooks. Takes an
  injected client; it does not depend on the react-native package.

## Task routing

| Building | Read first |
| --- | --- |
| Any new integration | https://dadocs.lightning.engineering/react-native/get-started/quickstart.md |
| Package install and native runtime staging | https://dadocs.lightning.engineering/react-native/get-started/installation.md |
| Platform, OS, and passkey requirements | https://dadocs.lightning.engineering/react-native/get-started/requirements.md |
| Passkey rpId domain association | https://dadocs.lightning.engineering/react-native/get-started/passkey-setup.md |
| Wallet creation and unlock | https://dadocs.lightning.engineering/guides/create-a-wallet.md |
| Passkey protection | https://dadocs.lightning.engineering/guides/use-a-passkey.md |
| Build or runtime failures | https://dadocs.lightning.engineering/react-native/troubleshooting.md |
| Exact API surface | https://dadocs.lightning.engineering/reference/walletdk-react-native.md |

## Critical rules

- Create the client with `createNativeClient()` from walletdk-react-native
  and pass it to `<WalletDKProvider createClient={createNativeClient}>` as
  the factory prop. The provider calls the factory once and memoizes the
  client, so the client is created when the provider mounts rather than at
  module import time.
- Requires React Native 0.76 or newer, iOS 15.1+, and Android minSdk 24.
  The New Architecture must be enabled. This package is New Architecture
  only; it does not support the legacy architecture.
- Expo apps need a **development build**, not Expo Go: the native wallet
  runtime is a compiled module that Expo Go cannot load. `npx expo run:android`
  and `npx expo run:ios` both produce development builds that include it.
- Until hosted binary distribution ships, the native wallet runtime
  binaries (`Walletdk.aar`, `Walletdk.xcframework`) must be staged from a
  source checkout before the first build; see the installation page above.
- Passkey ceremonies are injected. Pass `createNativePasskeyCeremony({ rpId })`
  from walletdk-react-native into `usePasskeyWallet(ceremony)`; do not
  implement platform authentication calls by hand. The `rpId` domain needs
  an `assetlinks.json` (Android) and an `apple-app-site-association` plus
  Associated Domains entitlement (iOS); see the passkey setup page above.
  iOS passkey support is experimental.
- Activity arrives as typed `activity` events, re-emitted from native
  `walletdkActivity` device events; do not poll for state changes by hand.

## Verify the integration

After wiring, confirm: the app builds and launches on a device or
simulator via a development build (not Expo Go), `createNativeClient()`
resolves, wallet creation reaches the ready state, and an invoice can be
created.

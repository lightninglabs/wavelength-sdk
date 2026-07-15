# @lightninglabs/wavelength-react-native

The React Native transport for [Wavelength](../../README.md): embed a
self-custodial Lightning wallet directly in your app. Your users send and
receive Lightning payments with no node to run, no channels to open, and no
inbound liquidity to manage, while the keys stay on their own device. The
wallet runtime is compiled into the app binary, so there is no backend to
operate and nothing listening on a socket. Your app drives it through the
same typed client contract as the web transport.

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
npm install @lightninglabs/wavelength-react-native @lightninglabs/wavelength-react
```

The native wallet runtime binaries currently ship out of band rather than
inside the npm package; hosted distribution is coming. Until then, build
them from a checkout of this repository with `scripts/fetch-bindings.sh`
(which compiles them from a daemon source checkout named by `WAVELENGTH_DIR`)
and stage them into this package before running `pod install` / a Gradle
build.

## Quick start

```tsx
import { WavelengthProvider, useWallet } from '@lightninglabs/wavelength-react';
import { createNativeWalletEngine } from '@lightninglabs/wavelength-react-native';

const engine = createNativeWalletEngine();

export default function App() {
  return (
    <WavelengthProvider engine={engine}>
      <Wallet />
    </WavelengthProvider>
  );
}
```

`createNativeWalletEngine()` builds a `WalletEngine` backed by the wallet
runtime compiled into your app; pass it to `WavelengthProvider` and use the
same hooks (`useWallet`, `useWalletBalance`, `useWalletSend`,
`useWalletReceive`, `useWalletDeposit`, `useWalletActivity`) documented in
[`@lightninglabs/wavelength-react`](../react).

## Passkey wallets

The transport ships a native passkey ceremony, so users can create and unlock
a wallet with a platform passkey instead of a password:

```tsx
import { useWalletPasskey } from '@lightninglabs/wavelength-react';
import { createNativePasskeyCeremony } from '@lightninglabs/wavelength-react-native';

const ceremony = createNativePasskeyCeremony({ rpId: 'wallet.example.com' });

function PasskeyButton() {
  const passkey = useWalletPasskey(ceremony);
  if (!passkey.supported) return null;
  return (
    <Button
      title="Create with passkey"
      disabled={passkey.createPending}
      onPress={() => passkey.create('My Wallet App')}
    />
  );
}
```

Passkeys bind to a relying-party domain (`rpId`) that must vouch for your
app:

- **Android:** serve
  `https://<rpId>/.well-known/assetlinks.json` listing your app's package
  name and signing-certificate SHA-256 fingerprint with both relations the
  platform checks (`delegate_permission/common.handle_all_urls` and
  `delegate_permission/common.get_login_creds`), and declare the association
  in your app: an `asset_statements` string resource that includes that
  assetlinks URL, referenced by a manifest `meta-data` entry. Without either
  half the ceremony fails with "RP ID cannot be validated". At runtime the
  device needs Android 9+ (API 28), Google Play services with a signed-in
  Google account, and a device screen lock.
- **iOS (experimental):** add the Associated Domains capability
  (`webcredentials:<rpId>`) to your app and serve
  `https://<rpId>/.well-known/apple-app-site-association` listing your Team
  ID and bundle id. Requires iOS 18 or newer at runtime. The iOS ceremony is
  implemented and unit-tested but has not yet been verified end to end;
  treat it as experimental.

`supportsPasskeyPrf()` (surfaced as `passkey.supported` by the hook) reports
whether the platform prerequisites are present; a supported device can still
decline the ceremony, which surfaces as a normal error.

## Known limitations

- Wallet runtime logs go to the platform log (Android logcat, iOS os_log),
  not to JS-visible events. Use your platform's native log viewer while
  debugging.

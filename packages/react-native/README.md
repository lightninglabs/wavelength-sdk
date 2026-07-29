# @lightninglabs/wavelength-react-native

The React Native transport for [Wavelength](https://wavelength.lightning.engineering): embed a
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

The native wallet runtime binaries (`Wavewalletdk.aar` and
`Wavewalletdk.xcframework`) are not bundled inside the npm package. Stage them
into this package before running `pod install` or a Gradle build.

Download them from the [wavelength release](https://github.com/lightninglabs/wavelength/releases)
tagged with the `RUNTIME_MANIFEST_VERSION` that
`@lightninglabs/wavelength-core` exports, then, from the installed package
directory:

```sh
TMP="$(mktemp -d ./.stage-XXXXXX)"
tar -xzf ~/Downloads/Wavewalletdk.xcframework.tar.gz \
  -C "$TMP" Wavewalletdk.xcframework
extracted=$?

# The release archive is the raw gomobile output, whose headers use the ObjC
# modules syntax. clang rejects that while compiling this package's
# Objective-C++ glue, so rewrite it to a classic import.
find "$TMP/Wavewalletdk.xcframework" -name '*.h' \
  -exec sed -i.orig 's|@import Foundation;|#import <Foundation/Foundation.h>|' {} +
find "$TMP/Wavewalletdk.xcframework" -name '*.h.orig' -delete

# Swap in only if tar succeeded, since pasted commands do not stop at the first
# error and the removal below is destructive. tar's exit status is the test to
# use: a truncated archive still leaves a directory behind, headers and all, so
# checking that the framework exists would not catch an interrupted download.
# The podspec check confirms this is the package directory, so a paste from the
# wrong one cannot delete something else's ios/.
if [ "$extracted" -eq 0 ] && [ -f ~/Downloads/Wavewalletdk.aar ] &&
   [ -f WavelengthReactNative.podspec ]; then
  mkdir -p android/libs
  cp ~/Downloads/Wavewalletdk.aar android/libs/
  # Replace the framework rather than unpacking over it: tar merges into an
  # existing directory and would leave slices from an earlier revision behind.
  rm -rf ios/Wavewalletdk.xcframework
  mv "$TMP/Wavewalletdk.xcframework" ios/
else
  echo "staging failed; previous binaries left in place" >&2
fi
rm -rf "$TMP"
```

Working from a checkout of this repository instead, the `bindings:fetch` script
does all of the above for you, and `bindings:local` builds the binaries from the
daemon source named by `WAVELENGTH_DIR` (for unreleased daemon revisions).
Neither ships in the published package: both resolve paths relative to the
repository root, which does not exist in an install.

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
[`@lightninglabs/wavelength-react`](https://www.npmjs.com/package/@lightninglabs/wavelength-react).

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

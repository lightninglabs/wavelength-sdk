# rn-wallet-demo

The reference React Native app for [WalletDK](../../README.md): a
self-custodial Lightning wallet embedded in an Expo app. It exercises the full
wallet flow: create, restore, or unlock (password or passkey), recovery-phrase
backup, on-chain boarding and Lightning receive with scannable QRs, send, live
activity, runtime controls, local-data wipe, and light/dark themes, all
through [`@lightninglabs/wavelength-react-native`](../../packages/react-native)
and the shared [`@lightninglabs/wavelength-react`](../../packages/react) hooks.

This app is a development harness, not a published product. It runs as an Expo
**development build**; Expo Go cannot load the compiled wallet runtime.

## Requirements

- Node and pnpm (the workspace toolchain).
- **Android:** the Android SDK and NDK, a JDK (17+), and a running emulator or
  a connected device.
- **iOS:** macOS with Xcode and an installed iOS simulator runtime.
- **Wallet runtime binaries:** built from a daemon source checkout by
  `packages/react-native/scripts/fetch-bindings.sh` (they are gitignored, not
  committed). See below.
- For the regtest flow: the local regtest stack running (the wallet expects
  the operator gRPC on `:7070`, Esplora on `:8501`, and the swap server gRPC
  on `:10030`).

## Setup

From the repository root:

```sh
# 1. Build and stage the native wallet runtime for both platforms. Point
#    DAREPO_DIR at your daemon source checkout. The first build compiles the
#    daemon for every ABI and takes several minutes; rerun it whenever the
#    paired daemon revision changes.
DAREPO_DIR=/path/to/daemon-checkout \
  pnpm --filter @lightninglabs/wavelength-react-native run fetch-bindings

# 2. Install and build the workspace.
pnpm install && pnpm build
```

## Run

Start Metro in its own terminal, then build and launch per platform:

```sh
cd apps/rn-wallet-demo

npx expo start --dev-client --clear     # Metro (keep running)

npx expo run:android                    # Android emulator or device
LANG=en_US.UTF-8 npx expo run:ios       # iOS simulator (locale needed by pod install)
```

The first `expo run:*` generates the native `android/` and `ios/` projects
(gitignored) and takes a while; later runs are incremental.

## Networks

The start screen offers four presets (defined in `src/lib/runtime-config.ts`):

- **regtest** targets the local stack. Host addressing is automatic per
  platform: the Android emulator reaches your machine as `10.0.2.2`, the iOS
  simulator as `127.0.0.1`.
- **testnet**, **testnet4**, and **signet** target the public test network
  deployments over TLS and also work on physical devices.

Every endpoint is editable under "Advanced endpoints" before starting, so a
preset is a starting point, not a limit.

## App structure

The app mirrors the web demo (`apps/web-wallet-demo`) screen for screen so
the two SDK surfaces can be compared directly:

- `src/WalletApp.tsx` routes by wallet lifecycle phase (connect, create or
  restore, backup, unlock, syncing, stopped, error) and hosts the
  authenticated tabs (Overview, Activity, Receive, Send, Settings).
- `src/theme/` holds the shared design tokens (light and dark palettes, IBM
  Plex type) behind a small theme context; the preference persists across
  restarts and survives a data wipe.
- Settings offers the runtime status, identity key, theme switch, read-only
  server configuration, stop runtime, and "Clear wallet data", which stops
  the runtime and deletes the wallet's data directory on device.

## Passkeys

The create/unlock screen offers passkey buttons when the platform supports
them. The relying party is `dadocs.lightning.engineering`, whose
`/.well-known/` association files vouch for this demo app; that association
is demo-grade on purpose (it lists the shared debug signing certificate every
local build uses), so treat wallets created with it as throwaways.

- **Android:** works on a Play Store emulator image with a signed-in Google
  account and a device screen lock (PIN) set. The association file must be
  live at `https://dadocs.lightning.engineering/.well-known/assetlinks.json`
  when the ceremony runs.
- **iOS:** not yet functional end to end; the entitlement is configured, but
  the server-side association awaits an Apple Developer Program Team ID. The
  buttons stay hidden below iOS 18 either way.

## Troubleshooting

- **The app shows UI that does not match the code.** Metro served a stale
  cached bundle; this is a recurring dev-server issue. Restart Metro with
  `npx expo start --dev-client --clear` and relaunch the app.
- **`walletdk mobile already started` after editing code.** A JS reload
  outlived the native wallet runtime. Force-quit the app and relaunch it.
- **Port 8081 is in use.** Another Metro instance is running; kill it
  (`pkill -f 'expo start'`) rather than accepting a different port, so
  installed apps can still reach the dev server.
- **`pod install` fails with a Unicode error.** Run the iOS build with a
  UTF-8 locale, as shown above.
- **Wallet runtime logs** go to the platform log, not the Metro console. Use
  `adb logcat` on Android. On iOS, relaunch the app attached to your
  terminal:

  ```sh
  xcrun simctl launch --console-pty --terminate-running-process \
    booted engineering.lightning.walletdk.demo
  ```

  The `--terminate-running-process` flag matters: without it, simctl only
  foregrounds the already-running app and its output stays detached. The
  relaunch resets the app, so start the runtime again before expecting logs.

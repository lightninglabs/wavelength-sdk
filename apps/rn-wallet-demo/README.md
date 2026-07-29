# rn-wallet-demo

The reference React Native app for [Wavelength](../../README.md): a
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
- **Wallet runtime binaries:** downloaded from the paired wavelength release
  by `packages/react-native/scripts/fetch-bindings.sh` (they are gitignored,
  not committed). See below.
- For the regtest flow: the local regtest stack running (the wallet expects
  the operator gRPC on `:7070`, Esplora on `:8501`, and the swap server gRPC
  on `:10030`).

## Setup

From the repository root:

```sh
# 1. Download and stage the native wallet runtime for both platforms from the
#    paired wavelength release; rerun it whenever the paired daemon revision
#    changes. To build from a local daemon checkout instead (for an unreleased
#    daemon revision), use `run bindings:local` with WAVELENGTH_DIR set.
pnpm --filter @lightninglabs/wavelength-react-native run bindings:fetch

# 2. Install and build the workspace.
pnpm install && pnpm build
```

## Run

Start Metro in its own terminal, then build and launch per platform:

```sh
cd apps/rn-wallet-demo

npx expo start --dev-client --clear     # Metro (keep running)

pnpm run android                        # Android emulator or device
pnpm run ios                            # iOS simulator
```

The first run generates the native `android/` and `ios/` projects (gitignored)
and takes a while; later runs are incremental. The `ios` script sets a UTF-8
locale, which `pod install` needs.

The iOS build needs no code signing, so it works on a machine that has never
set up an Apple developer account. Enabling passkeys is the one exception; see
[Passkeys](#passkeys) below.

## Networks

The start screen offers three presets (defined in `src/lib/runtime-config.ts`):

- **regtest** targets the local stack. Host addressing is automatic per
  platform: the Android emulator reaches your machine as `10.0.2.2`, the iOS
  simulator as `127.0.0.1`.
- **testnet** and **signet** target the public test network
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
them. The relying party is `wavelength.lightning.engineering`, whose
`/.well-known/` association files vouch for this demo app; that association
is demo-grade on purpose (it lists the shared debug signing certificate every
local build uses), so treat wallets created with it as throwaways.

- **Android:** works on a Play Store emulator image with a signed-in Google
  account and a device screen lock (PIN) set. The association file must be
  live at `https://wavelength.lightning.engineering/.well-known/assetlinks.json`
  when the ceremony runs.
- **iOS:** not yet functional end to end; the server-side association awaits an
  Apple Developer Program Team ID. The buttons stay hidden below iOS 18 either
  way. The entitlement passkeys need is opt-in:

  ```sh
  npx expo prebuild --clean -p ios   # only when switching the flag
  pnpm run ios:passkeys
  ```

  iOS passkeys require an associated-domains entitlement, and `expo run:ios`
  refuses to build any target that declares one unless the machine has an Apple
  development certificate, simulator builds included. Leaving it off by default
  keeps the ordinary build free of that requirement. `app.config.ts` adds the
  entitlement when `WAVELENGTH_IOS_PASSKEYS=1`, which the `ios:passkeys` script
  sets. Entitlements are baked into the generated `ios/` project, so switching
  the flag takes a `prebuild --clean` to take effect.

## Multi-wallet manual verification

There is no hermetic smoke test for this app (see the repo root
`CLAUDE.md`), so the wallet-list and per-wallet flows are checked by hand
against a regtest stack. Cover at least:

- [ ] Create a passkey wallet and a password wallet, each with a distinct
      name, and confirm both land back on the wallet list.
- [ ] The list renders each wallet's kind chip, an "unfinished" badge for an
      entry that never finished setup, and orders entries by most recently
      used.
- [ ] Switch wallets from Settings and confirm the switch returns to the
      list with the other entry unlockable.
- [ ] Delete a single wallet (long-press its row, then confirm) and verify
      its data is actually gone: recreate a wallet with the same name and
      confirm it starts fresh rather than picking up the deleted entry's
      state.
- [ ] Legacy migration: set the old flat `wavelength.walletKind` and
      `wavelength.passkeyCredentialId` AsyncStorage keys directly (a dev
      build makes this easy), relaunch, and confirm the migrated entry shows
      the one-time network picker before it can start.
- [ ] The regtest network preset is reachable only through the long-press
      gate on the network picker, matching the web demo's dev-only
      affordance.
- [ ] Restoring from a passkey that already unlocks another entry on this
      device short-circuits to that existing entry instead of minting a
      duplicate. Android only: iOS passkeys remain experimental (see
      [Passkeys](#passkeys)).
- [ ] If the running app shows UI that does not match the code you just
      changed, restart Metro with `--clear` (see Troubleshooting below)
      before chasing the symptom further.

## Troubleshooting

- **The app shows UI that does not match the code.** Metro served a stale
  cached bundle; this is a recurring dev-server issue. Restart Metro with
  `npx expo start --dev-client --clear` and relaunch the app.
- **`wavelength mobile already started` after editing code.** A JS reload
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
    booted engineering.lightning.wavelength.demo
  ```

  The `--terminate-running-process` flag matters: without it, simctl only
  foregrounds the already-running app and its output stays detached. The
  relaunch resets the app, so start the runtime again before expecting logs.

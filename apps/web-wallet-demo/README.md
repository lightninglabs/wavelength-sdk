# web-wallet-demo

The reference web app for [Wavelength](../../README.md): a self-custodial
Lightning wallet embedded in a browser page. It exercises the full wallet
flow: create, restore, or unlock (password or passkey), recovery-phrase
backup, on-chain boarding and Lightning receive with scannable QRs, send,
live activity, runtime controls, local-data wipe, and light/dark themes, all
through [`@lightninglabs/wavelength-web`](../../packages/web) and the shared
[`@lightninglabs/wavelength-react`](../../packages/react) hooks. The React
Native demo ([`apps/rn-wallet-demo`](../rn-wallet-demo)) mirrors it screen
for screen so the two SDK surfaces can be compared directly.

This app is a development harness, not a published product. It also hosts the
Playwright smoke test, the repository's gold-standard end-to-end check.

## Requirements

- Node and pnpm (the workspace toolchain).
- The wasm runtime assets staged into `public/runtime/<version>/` (they are
  gitignored, not committed). See Setup below.
- For the regtest flow: the local regtest stack running (the wallet expects
  the operator REST gateway on `:7071`, Esplora on `:8501`, and the swap
  gateway on `:10032`).

## Setup

From the repository root:

```sh
# 1. Install and build the workspace.
pnpm install && pnpm build

# 2. Stage the wasm runtime assets from the paired wavelength release. To
#    build them from a local daemon checkout instead (for an unreleased
#    daemon revision; needs Go), use `run wasm:local` with WAVELENGTH_DIR set.
pnpm --filter web-wallet-demo run wasm:fetch
```

Rerun the staging step whenever the paired daemon revision
(`RUNTIME_MANIFEST_VERSION` in `packages/core`) changes.

## Run

```sh
pnpm --filter web-wallet-demo run dev
```

## Networks

The create screen offers **signet** and **testnet** presets, which target the
public test network deployments. **regtest** targets the local stack and is a
hidden dev option behind a long-press gate on the network picker. Every
endpoint is editable under the advanced fields before starting, so a preset
is a starting point, not a limit.

## Smoke test

```sh
pnpm --filter web-wallet-demo run build
pnpm --filter web-wallet-demo run test
```

The smoke test is hermetic: `smoke-server.js` mocks every backend and serves
the built demo from `dist/`, so no regtest stack is required. It defaults to
port 8790 and runs locally only; CI does not run it. A second config,
`run test:signet`, exercises the built demo against the public signet
deployment instead.

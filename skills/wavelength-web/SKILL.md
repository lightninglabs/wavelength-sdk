---
name: wavelength-web
description: Embed a self-custodial Lightning wallet in a web app with the Wavelength SDK (@lightninglabs/wavelength-web, @lightninglabs/wavelength-react, @lightninglabs/wavelength-core). Use when integrating Wavelength into a browser or React app, creating a wallet client, sending or receiving Lightning payments in the browser, wiring WavelengthProvider, hosting wasm runtime assets, or adding passkey protection. Triggers include "wavelength", "embed a Lightning wallet", "createWebWalletEngine", "WavelengthProvider", "useWalletPasskey", and "wavelength runtime assets".
---

# Wavelength web integration

Wavelength embeds a self-custodial Lightning wallet in a web app. The wallet
daemon runs as WebAssembly in a Web Worker in the user's browser; there is no
node to run, no channels to open, and no inbound liquidity to manage.

Docs index: https://wavelength.lightning.engineering/llms.txt. Every docs page
has a markdown twin at the same URL with `.md` appended; fetch those.

## Packages

Check the npm registry for current versions; do not rely on memorized ones.

- `@lightninglabs/wavelength-web`: the browser transport. `createWebClient()`
  builds a raw client; `createWebWalletEngine()` wraps it in a `WalletEngine`
  and is the factory to use with the React provider. Re-exports everything
  from core.
- `@lightninglabs/wavelength-react`: `<WavelengthProvider>` plus hooks. Takes an
  injected engine; it does not depend on the web package.
- `@lightninglabs/wavelength-core`: the transport-agnostic contract and types.
  Install it directly only when building a custom binding.

## Task routing

| Building | Read first |
| --- | --- |
| Any new integration | https://wavelength.lightning.engineering/web/get-started/quickstart.md |
| React app | https://wavelength.lightning.engineering/integrations/react.md |
| Wallet creation and unlock | https://wavelength.lightning.engineering/guides/create-a-wallet.md |
| Sending payments | https://wavelength.lightning.engineering/guides/send-a-payment.md |
| Receiving payments | https://wavelength.lightning.engineering/guides/receive-a-lightning-payment.md |
| Passkey protection | https://wavelength.lightning.engineering/guides/use-a-passkey.md |
| Asset hosting or COOP/COEP issues | https://wavelength.lightning.engineering/web/get-started/hosting-runtime-assets.md |

## Critical rules

- Create the engine with `createWebWalletEngine()` from wavelength-web and
  inject it into React via `<WavelengthProvider engine={...}>`. Never import
  wavelength-web inside framework-agnostic or react-only modules; the react
  package deliberately has no dependency on the web transport.
- The wasm runtime assets are self-hosted by the embedding app. Copy them to
  a public directory and point `runtimeBaseUrl` at it. There is no CDN
  default yet; a missing or wrong `runtimeBaseUrl` is the most common
  integration failure.
- Passkey ceremonies are injected. Pass `webPasskeyCeremony` from
  wavelength-web into `useWalletPasskey(ceremony)`; do not implement WebAuthn
  calls by hand.
- The daemon persists to OPFS. Wallet state survives reloads; test flows
  must unlock an existing wallet rather than recreating it on every load.
- Wallet state arrives as a lowercase string union (for example "ready");
  daemon JSON is camelCase at the SDK boundary. Do not pattern-match proto
  numeric states or PascalCase field names from daemon-level docs.

## Verify the integration

After wiring, confirm: the app builds, the engine's `phase` (from
`useWallet()`) reaches `ready`, and an invoice can be created. Reload the
page and unlock to confirm persistence.

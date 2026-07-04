---
name: walletdk-web
description: Embed a self-custodial Lightning wallet in a web app with the WalletDK SDK (@lightninglabs/walletdk-web, @lightninglabs/walletdk-react, @lightninglabs/walletdk-core). Use when integrating WalletDK into a browser or React app, creating a wallet client, sending or receiving Lightning payments in the browser, wiring WalletDKProvider, hosting wasm runtime assets, or adding passkey protection. Triggers include "walletdk", "embed a Lightning wallet", "createWebClient", "WalletDKProvider", "usePasskeyWallet", and "walletdk runtime assets".
---

# WalletDK web integration

WalletDK embeds a self-custodial Lightning wallet in a web app. The wallet
daemon runs as WebAssembly in a Web Worker in the user's browser; there is no
node to run, no channels to open, and no inbound liquidity to manage.

Docs index: https://dadocs.lightning.engineering/llms.txt. Every docs page
has a markdown twin at the same URL with `.md` appended; fetch those.

## Packages

Check the npm registry for current versions; do not rely on memorized ones.

- `@lightninglabs/walletdk-web`: the browser transport. `createWebClient()`
  is the factory. Re-exports everything from core.
- `@lightninglabs/walletdk-react`: `<WalletDKProvider>` plus hooks. Takes an
  injected client; it does not depend on the web package.
- `@lightninglabs/walletdk-core`: the transport-agnostic contract and types.
  Install it directly only when building a custom binding.

## Task routing

| Building | Read first |
| --- | --- |
| Any new integration | https://dadocs.lightning.engineering/web/get-started/quickstart.md |
| React app | https://dadocs.lightning.engineering/integrations/react.md |
| Wallet creation and unlock | https://dadocs.lightning.engineering/guides/create-a-wallet.md |
| Sending payments | https://dadocs.lightning.engineering/guides/send-a-payment.md |
| Receiving payments | https://dadocs.lightning.engineering/guides/receive-a-lightning-payment.md |
| Passkey protection | https://dadocs.lightning.engineering/guides/use-a-passkey.md |
| Asset hosting or COOP/COEP issues | https://dadocs.lightning.engineering/web/get-started/hosting-runtime-assets.md |

## Critical rules

- Create the client with `createWebClient()` from walletdk-web and inject it
  into React via `<WalletDKProvider client={...}>`. Never import
  walletdk-web inside framework-agnostic or react-only modules; the react
  package deliberately has no dependency on the web transport.
- The wasm runtime assets are self-hosted by the embedding app. Copy them to
  a public directory and point `runtimeBaseUrl` at it. There is no CDN
  default yet; a missing or wrong `runtimeBaseUrl` is the most common
  integration failure.
- Passkey ceremonies are injected. Pass `webPasskeyCeremony` from
  walletdk-web into `usePasskeyWallet(ceremony)`; do not implement WebAuthn
  calls by hand.
- The daemon persists to OPFS. Wallet state survives reloads; test flows
  must unlock an existing wallet rather than recreating it on every load.
- Wallet state arrives as a lowercase string union (for example "ready");
  daemon JSON is camelCase at the SDK boundary. Do not pattern-match proto
  numeric states or PascalCase field names from daemon-level docs.

## Verify the integration

After wiring, confirm: the app builds, `createWebClient()` resolves, wallet
creation reaches the ready state, and an invoice can be created. Reload the
page and unlock to confirm persistence.

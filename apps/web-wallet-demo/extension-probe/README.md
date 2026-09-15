# Chrome extension storage and runtime probe

This development fixture exercises the browser boundary in
[EPIC #77](https://github.com/lightninglabs/wavelength-sdk/issues/77). It is an
unpacked Manifest V3 extension, not a wallet product or a production background
service. It creates disposable storage and an unfunded regtest wallet against
the demo's existing mocked backend. No public server or funded wallet is used.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter web-wallet-demo wasm:fetch
pnpm --filter web-wallet-demo build:extension
pnpm --filter web-wallet-demo exec playwright install chromium
pnpm --filter web-wallet-demo test:extension
```

`WAVELENGTH_EXTENSION_RUNTIME_DIR=/absolute/path/to/assets` can select an
already-staged release directory for `build:extension`. The build checks all
nine pinned runtime digests before copying assets into its ignored `dist/`.
Local runtime builds with different digests are deliberately rejected.

Tests launch Playwright's bundled Chromium in isolated temporary profiles,
load only this extension, and start `smoke-server.js` on `127.0.0.1:8806`.
The suite refuses to reuse an existing server on that port. Profiles are removed
at teardown. It never launches or modifies an everyday browser profile.
The modified-bootstrap tests alter only a generated copy and restore it.

## Ownership model

```text
Popup document -> extension service worker -> offscreen document
                                               |
                                               +-> Wavelength Web Worker
                                               |     +-> SQLite workers / OPFS
                                               +-> storage fixture worker

App records: chrome.storage.local in the same extension origin
```

The offscreen document owns the wallet client and is created with the `WORKERS`
reason. The service worker routes a fixed set of fixture messages and re-discovers
the owner after its own restart. Concurrent owner creation is coalesced. The
fixture exposes no arbitrary RPC/signing endpoint, content script bridge or
externally-connectable origin. Its only network permission is loopback for the
mock backend.

The low-level storage fixture holds one flushed OPFS file handle. Separately,
the real wallet test uses the SDK, Go WASM runtime and SQLite stores. A Web Lock
rejects a competing SDK client before it can open the same wallet. The app's
business record remains in `chrome.storage.local`. Separate stores share the
extension origin; this is a persistence-ownership boundary, not isolation from
other trusted extension code or an independent quota.

## Observations on 2026-09-15

Baseline: SDK main at `4f98610`, pinned Wavelength v0.1.2 assets, Playwright
1.60.0, bundled Chrome for Testing 148.0.7778.96, macOS arm64.

| Probe | Result |
|---|---|
| Service-worker capabilities | No `Worker` constructor; cannot directly host the SDK's default dedicated-worker transport |
| Separate managed file and app store | OPFS writes and `chrome.storage.local` coexist under the extension origin |
| Popup replacement | The same offscreen owner and stored data remain available |
| Service-worker termination | Explicit CDP termination produces a new service-worker generation; the offscreen owner remains the same |
| Competing OPFS handle | Rejected with `NoModificationAllowedError` |
| Owner replacement | Its worker is destroyed without an explicit handle close; a new owner reads the flushed record |
| Browser restart | Reusing the disposable profile preserves the OPFS record and app business record |
| SDK bootstrap before the fix | MV3 blocks `importScripts(blob:chrome-extension://...)` before wallet startup |
| SDK bootstrap after the fix | Both worker and main-thread runtimes boot under the packaged extension CSP |
| Modified bootstrap asset | Both modes reject it with `asset_integrity_failed` |
| Real wallet recovery | The same wallet and exact invoice reopen after owner replacement and browser restart; a competing SDK client returns `wallet_locked` |

The real wallet test creates one unpaid invoice, keeps the same wallet across
popup and service-worker replacement, then destroys its owner and reopens with
the original test password. It checks the original identity, exactly one
matching activity ID and the exact invoice. Creation is forbidden on reopen.
The test also repeats reopen after a full browser restart with the same profile.
This exercises the real persistence stack against mocks; it does not prove
payment settlement or recovery at arbitrary protocol crash boundaries.

The final six-test extension run passed in 16.5 seconds. The existing web smoke
suite also passed all eight tests (59.7 seconds), and all 168 web unit tests
passed. Package build, workspace typecheck and the docs build passed locally.
The browser suites remain local checks; this change does not add them to CI.

## Packaged bootstrap fix

The web loader normally hashes scripts and executes those exact bytes from blob
URLs. Chrome's MV3 script policy rejects that execution mechanism. Both loaders
now recognize assets packaged under their own `chrome-extension:` host, verify
them, and execute their original package URLs. The exception depends on the
browser owning the installed package and its update lifecycle. It is never
applied to HTTP(S) assets, another extension's host or ordinary same-origin web
resources, which keep verified blob execution. Digest failures remain fatal.

The fixture uses `script-src 'self' 'wasm-unsafe-eval'`, with no blob scripts or
remote runtime code. The manifest also sets COOP `same-origin` and COEP
`require-corp` so SQLite's SharedArrayBuffer/OPFS path is available.

## Recommendation and remaining work

The mobile storage recommendation also fits this Chrome experiment: let
Wavelength own its authoritative databases and let the host own its app records.
There is no evidence here that an extension needs a generic IndexedDB adapter
for wallet state. Keep one wallet owner independent of short-lived UI documents,
and reconnect the UI through a small authenticated message boundary.

An offscreen document does not make the protocol continuously available. The
test forces service-worker termination; it does not measure Chrome's natural
idle scheduling, laptop sleep, memory pressure or extension updates. The popup
fixture is opened as an extension tab so document destruction is deterministic;
toolbar-popup interaction is not measured. Browser restart preserves local
profile files, not device-loss recovery or a consistent wallet backup.

The test supplies the password again after losing the owner and does not persist
it in the app's business store. A production host must decide when its signer
is available and what a locked wake can safely do. Do not infer background
signing authorization from an extension event.

Next probes:

1. Add bounded pump outcomes and interruption tests at the engine boundary shared
   with mobile: needs unlock, awaiting peer, more work, transient error and
   durable progress after budget exhaustion. This is still
   [wavelength#802](https://github.com/lightninglabs/wavelength/issues/802).
2. Exercise missing/delayed execution, extension update, long offline periods,
   quota/eviction policy and backup. App/Wavelength storage separation alone
   settles none of those guarantees.
3. Add funded signet recovery only after the host's ownership and credential
   policy is explicit. Evaluate Firefox and Safari separately; this result is
   scoped to Chrome MV3.

References: [extension storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies),
[service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
[offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen),
[CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy),
[COOP](https://developer.chrome.com/docs/extensions/reference/manifest/cross-origin-opener-policy),
[COEP](https://developer.chrome.com/docs/extensions/reference/manifest/cross-origin-embedder-policy),
and [Playwright extension testing](https://playwright.dev/docs/chrome-extensions).

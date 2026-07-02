---
name: syncing-daemon-release
description: Use when darepo-client publishes a new release or revision and this repo must be updated to pair with it, when generated.ts / wallet.json / RUNTIME_MANIFEST_VERSION are stale, when gen:types or gen:api-docs fails or drifts, or when daemon-side RPC, facade type, CLI flag, or wasm asset changes need to land here.
---

# Syncing to a New darepo-client Release

## Overview

One pinned daemon revision drives four committed artifacts that must move
together: the generated facade types (`packages/core/src/generated.ts`), the
API reference data (`apps/docs/src/data/api/wallet.json`), the wasm runtime
asset set, and the pin itself (`RUNTIME_MANIFEST_VERSION` in
`packages/core/src/version.ts`). A sync is complete only when all four match
the same daemon commit and the verification ladder passes.

All generators read the darepo-client checkout at `../darepo-client` or
`$DAREPO_DIR`. In a worktree, always pass `DAREPO_DIR=<absolute path>`.

## Quick reference: what changed upstream -> what to touch here

| Upstream change | Regenerate | Hand-update |
|---|---|---|
| Facade type fields (`sdk/walletdk`) | `pnpm gen:types` | Consumers of renamed fields: `git grep <old_field>` across `packages/`, `apps/`; mappers in `packages/web/src/clients/base.ts`; `requests.ts`/`results.ts` stay hand-authored (see `docs/codegen.md`) |
| WalletService RPC added/removed | `pnpm gen:api-docs` | `API_NAV` (it IS in `apps/docs/src/config/nav.ts`, below the SDK `NAV` array); `API_CLI`, `API_CLI_INVOCATION`, `API_SAMPLES` in `apps/docs/src/config/api.ts`; the whole client surface: interface + request/result types in `packages/core` (`client.ts`, `requests.ts`, `results.ts`), impl in `packages/web/src/clients/` (`base.ts`, and check `main.ts`/`worker.ts` for per-method wiring); the SDK reference pages that document the client (`apps/docs/src/content/docs/reference/walletdk-core.mdx`, `web/reference/walletdk-web.mdx`) |
| RPC/field doc comments only | `pnpm gen:api-docs` | Nothing (pages render from wallet.json) |
| darepocli flags/commands | Nothing | The command's page in `apps/docs/src/content/docs/cli/` (see CLI docs rules below); new top-level command also needs `CLI_NAV` + a new page |
| Daemon operational facts (ports, TLS, build tags, gateway behavior) | Nothing | `apps/docs/src/content/docs/api/get-started.mdx` and `api/rest.mdx`; `cli.mdx` global flags/exit codes |
| Wasm runtime build | `wasm:local` (below) | Bump `RUNTIME_MANIFEST_VERSION` first |
| Runtime asset FILE LIST | Nothing | Four places in lockstep: `packages/web/src/runtime-manifest.ts` (`RUNTIME_ASSET_FILES`), `apps/web-wallet-demo/scripts/wasm-local.sh`, `apps/web-wallet-demo/scripts/fetch-runtime-assets.sh`, `apps/docs/scripts/copy-runtime-assets.mjs` |

## Ordered procedure

```sh
export DAREPO_DIR=/absolute/path/to/darepo-client   # checked out at the release
```

1. **Pin**: set `RUNTIME_MANIFEST_VERSION` in `packages/core/src/version.ts`
   to the daemon short commit hash. Keep the exact single-quoted literal form;
   `scripts/runtime-version.mjs` parses the source text.
2. **Types**: `pnpm gen:types` (needs Go + tygo). Review the generated.ts
   diff, then grep-and-fix hand-authored consumers per the table.
3. **API data**: `pnpm gen:api-docs`. Its gates fail loudly by design:
   - Nav drift: update `API_NAV` (and the curation maps in `config/api.ts`)
     for added/removed RPCs, then re-run. Never weaken the check.
   - Missing doc comments: the fix is adding comments upstream in
     wallet.proto, never tolerating empty descriptions.
   - Run it twice; the second run must produce a byte-identical wallet.json.
   - Sample keys in `API_SAMPLES` must be real request field names (a spec
     enforces this); em-dashes are sanitized at extraction automatically.
4. **CLI/prose docs**: author from darepo-client source
   (`cmd/darepocli/darepoclicommands/cmd_*.go`: `Flags()` registrations with
   defaults, which RPC the `RunE` calls), NEVER from `--help` output (build
   tags hide commands and help text omits exit codes/JSON shapes). Every
   subcommand gets its own section with its own flags table (`ApiSymbol` +
   `ParamsTable` on reference-layout pages like ark/recovery/swap; `###`
   headings on doc-layout pages like exit). Verify operational claims in the
   API prose pages against `darepod/config.go` and `gateway_server.go`.
5. **Runtime assets**: `pnpm --filter web-wallet-demo run wasm:local`
   (builds from `$DAREPO_DIR`, stages into `public/runtime/<version>/`).
   Hosted asset sets live under `<assets root>/<RUNTIME_MANIFEST_VERSION>/`;
   the deploy workflow fetches by that path.
6. **Changeset + commits**: `pnpm changeset` for changed packages. Commits
   use bare area prefixes (`core:`, `web:`, `docs:`, `demo:`), one logical
   change each, every commit building on its own.

## Verification ladder (run in this order)

```sh
pnpm build && pnpm typecheck        # build FIRST; typecheck resolves dist/*.d.ts
pnpm test:api-docs                  # extractor unit tests (7+)
pnpm --filter @lightninglabs/walletdk-web test
DAREPO_DIR=... pnpm --filter @lightninglabs/walletdk-docs test   # needs runtime assets for prebuild
DAREPO_DIR=... pnpm --filter web-wallet-demo run wasm:local && \
  pnpm --filter web-wallet-demo run build && \
  pnpm --filter web-wallet-demo run test   # Playwright smoke test: the gold standard
git grep -nP '\x{2014}' -- packages apps scripts   # no em-dash, ever
```

## Common mistakes

- Running `pnpm typecheck` before `pnpm build` on a fresh checkout (cross-package imports resolve through built `dist/*.d.ts`).
- Rebuilding wasm before bumping the pin: `wasm-local.sh` stages into a directory named by the OLD version.
- Editing `apps/docs/src/data/api/wallet.json` or `packages/core/src/generated.ts` by hand; both are generated and committed.
- Documenting CLI flags from `--help` or memory instead of `cmd_*.go`.
- Changing the runtime asset file list in fewer than all four places.
- Guessed package filters: the docs app is `@lightninglabs/walletdk-docs`, the web package is `@lightninglabs/walletdk-web`, the demo is `web-wallet-demo`.

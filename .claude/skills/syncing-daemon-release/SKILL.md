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

All generators read the wavelength checkout at `../wavelength` or
`$WAVELENGTH_DIR`. Do not move the shared `../wavelength` checkout to the target
commit: it is often behind `origin` and may have local edits, so a
fast-forward or stash disturbs someone else's working tree. Instead pin the
daemon revision in an isolated, throwaway worktree and point `WAVELENGTH_DIR` at
it:

```sh
cd ../wavelength && git fetch origin
git worktree add --detach /tmp/darepo-<shorthash> <target-commit>
export WAVELENGTH_DIR=/tmp/darepo-<shorthash>          # absolute path
# ... run the whole sync ...
cd ../wavelength && git worktree remove --force /tmp/darepo-<shorthash>
```

## Quick reference: what changed upstream -> what to touch here

| Upstream change | Regenerate | Hand-update |
|---|---|---|
| Facade type fields (`sdk/walletdk`) | `pnpm gen:types` | Consumers of renamed fields: `git grep <old_field>` across `packages/`, `apps/`. Every RPC verb is mapped once in `packages/core/src/base-client.ts` (the transports in `packages/web/src/clients/` and `packages/react-native/` only supply `callRaw`, no per-verb mappers). `requests.ts`/`results.ts` stay hand-authored (see `docs/codegen.md`) |
| WalletService RPC added/removed | `pnpm gen:api-docs` | `API_NAV` (it IS in `apps/docs/src/config/nav.ts`, below the SDK `NAV` array); `API_CLI`, `API_CLI_INVOCATION`, `API_SAMPLES` in `apps/docs/src/config/api.ts`; the whole client surface, all in `packages/core`: interface in `client.ts`, request/result types in `requests.ts`/`results.ts`, impl in `base-client.ts` (one place; the transports pipe `callRaw` and need no edit), the public barrel `index.ts`, and `testing/fake-client.ts` (it `implements WavelengthClient`, so a new method fails typecheck until added); the client is documented only on `apps/docs/src/content/docs/reference/walletdk-core.mdx` (the web/RN reference pages re-export core and carry no method list), and any new inline reference type must be registered in `apps/docs/src/config/api-links.ts` (`coreSymbols` + `inlineTypeOwners`) for its deep link to resolve; docs Playwright tests that hardcode the method count must move (see the CLI/docs test note below) |
| RPC/field doc comments only | `pnpm gen:api-docs` | Nothing (pages render from wallet.json) |
| darepocli flags/commands | Nothing | The command's page in `apps/docs/src/content/docs/cli/` (see CLI docs rules below); a new top-level command also needs `CLI_NAV` + a new page. A REMOVED top-level command must be deleted in lockstep: its `cli/<cmd>.mdx` page, its `CLI_NAV` entry, its row in the `cli.mdx` command table, and its slug in `apps/docs/tests/cli.spec.ts`'s hardcoded advanced-command list (`git grep -n <cmd> apps/docs` to find stragglers) |
| Daemon operational facts (ports, TLS, build tags, gateway behavior) | Nothing | `apps/docs/src/content/docs/api/get-started.mdx` and `api/rest.mdx`; `cli.mdx` global flags/exit codes |
| Wasm runtime build | `wasm:local` (below) | Bump `RUNTIME_MANIFEST_VERSION` first |
| Runtime asset FILE LIST | Nothing | Four places in lockstep: `packages/web/src/runtime-manifest.ts` (`RUNTIME_ASSET_FILES`), `apps/web-wallet-demo/scripts/wasm-local.sh`, `apps/web-wallet-demo/scripts/fetch-runtime-assets.sh`, `apps/docs/scripts/copy-runtime-assets.mjs` |

## Ordered procedure

```sh
export WAVELENGTH_DIR=/absolute/path/to/wavelength   # an isolated worktree at
                                                     # the release (see Overview)
```

1. **Pin**: set `RUNTIME_MANIFEST_VERSION` in `packages/core/src/version.ts`
   to the daemon short commit hash. Keep the exact single-quoted literal form;
   `scripts/runtime-version.mjs` parses the source text.
2. **Types**: `pnpm gen:types` (needs Go + tygo). Review the generated.ts
   diff, then grep-and-fix hand-authored consumers per the table. Two upstream
   changes surface here as generator problems, both fixed inside
   `scripts/gen-types.mts`, never by hand-editing generated.ts:
   - A build failure `'any' only refers to a type` means the facade added an
     exported scalar const assigned from another package (e.g.
     `MaxSigningWorkers = darepod.MaxSigningWorkers`); tygo cannot inline the
     value and emits `export const X = any /* ... */;`. gen-types strips such
     unresolved consts; extend that strip if a new shape slips through.
   - Em-dashes in upstream Go doc comments reach generated.ts verbatim; gen-types
     sanitizes them to hyphens (mirroring the api-docs extractor). If the
     em-dash check still trips on generated.ts, the sanitizer regressed.
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
   `ParamsTable` on reference-layout pages like ark/recovery; `###`
   headings on doc-layout pages like exit). Verify operational claims in the
   API prose pages against `darepod/config.go` and `gateway_server.go`.
5. **Runtime assets**: `pnpm --filter web-wallet-demo run wasm:local`
   (builds from `$WAVELENGTH_DIR`, stages into `public/runtime/<version>/`).
   Hosted asset sets live under `<assets root>/<RUNTIME_MANIFEST_VERSION>/`;
   the deploy workflow fetches by that path.
6. **Changeset + commits**: `pnpm changeset` for changed packages. Commits
   use bare area prefixes (`core:`, `web:`, `docs:`, `demo:`), one logical
   change each, every commit building on its own.

## Verification ladder (run in this order)

```sh
pnpm build && pnpm typecheck        # build FIRST; typecheck resolves dist/*.d.ts
pnpm test:api-docs                  # extractor unit tests (7+)
pnpm --filter @lightninglabs/wavelength-web test
# Docs Playwright: its webServer has reuseExistingServer:true on port 4321, so
# it will silently attach to a stale preview from another worktree/session and
# serve an OLD build (a 404 for a brand-new page is almost always this, not a
# code bug). Pass a free PORT so it builds and serves THIS worktree fresh:
PORT=4399 WAVELENGTH_DIR=... pnpm --filter @lightninglabs/wavelength-docs test
WAVELENGTH_DIR=... pnpm --filter web-wallet-demo run wasm:local && \
  pnpm --filter web-wallet-demo run build && \
  pnpm --filter web-wallet-demo run test   # Playwright smoke test: the gold standard

# No em-dash, ever. `git grep -nP '\x{2014}'` fails on git builds without
# Unicode \x{} PCRE; this perl form is portable:
perl -CSD -ne 'print "$ARGV:$.\n" if /\x{2014}/' $(git ls-files packages apps scripts)
```

A *deterministic* smoke-test failure is often a legitimate daemon behavior
change, not a regression: read the trace's page snapshot
(`test-results/.../error-context.md`) before assuming the wallet broke. This
run, a just-created invoice began surfacing as a pending "Received" activity
row (it previously stayed hidden until settlement), so the assertion moved
rather than the code. Update the assertion to the new behavior; do not skip
the test.

## Common mistakes

- Running `pnpm typecheck` before `pnpm build` on a fresh checkout (cross-package imports resolve through built `dist/*.d.ts`).
- Rebuilding wasm before bumping the pin: `wasm-local.sh` stages into a directory named by the OLD version.
- Editing `apps/docs/src/data/api/wallet.json` or `packages/core/src/generated.ts` by hand; both are generated and committed. A `tsc` failure on generated.ts usually means tygo emitted a new cross-package const as `= any` (fix in `gen-types.mts`, item in step 2).
- Documenting CLI flags from `--help` or memory instead of `cmd_*.go`.
- Adding/removing an RPC without bumping the docs tests that hardcode the method count: `apps/docs/tests/nav.spec.ts` and `api-data.spec.ts` assert a literal count ("fifteen"/`15`), and `api-method.spec.ts` + `agent-artifacts.spec.ts` iterate every method (so the new page must actually build and be reachable).
- Forgetting that a new interface method breaks `packages/core/src/testing/fake-client.ts` (it `implements WavelengthClient`) and must be added to `packages/core/src/index.ts`.
- Changing the runtime asset file list in fewer than all four places.
- Guessed package filters: the docs app is `@lightninglabs/wavelength-docs`, the web package is `@lightninglabs/wavelength-web`, the demo is `web-wallet-demo`.

## After the sync: improve this skill

Every darepo-client release differs, so each run teaches something. Before you
finish, reflect on the run and propose concrete edits to THIS file, then apply
them on approval. Look specifically for:

- **Stale or wrong instructions**: a path/command/filter that did not exist or
  did not work as written (correct it, do not just note it).
- **New gotchas**: a build/test/generator failure whose cause was not obvious
  from the skill, or an upstream change shape not covered by the quick-reference
  table (add a row or a Common-mistakes line).
- **Friction that cost time**: anything you had to discover by trial and error
  that a one-line warning would have prevented.
- **Newly touched files**: a hand-update spot the table missed for the change
  class you hit.

Keep additions terse and specific (name the file, the symptom, the fix); prune
anything the run proved obsolete. Propose the diff to the user rather than
committing it silently. Skip only if the run surfaced nothing the skill did not
already cover.

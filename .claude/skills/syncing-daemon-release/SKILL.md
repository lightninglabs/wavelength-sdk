---
name: syncing-daemon-release
description: Use when wavelength publishes a new release or revision and this repo must be updated to pair with it, when generated.ts / wallet.json / RUNTIME_MANIFEST_VERSION are stale, when gen:types or gen:api-docs fails or drifts, or when daemon-side RPC, facade type, CLI flag, or wasm asset changes need to land here.
metadata:
  internal: true
---

# Syncing to a New wavelength Release

## Overview

One pinned daemon revision drives three committed artifacts that must move
together: the generated facade types (`packages/core/src/generated.ts`), the
API reference data (`apps/docs/src/data/api/wallet.json`), and the pin itself
(`RUNTIME_MANIFEST_VERSION` in `packages/core/src/version.ts`). The wasm
runtime asset set is gitignored and staged from the pin, not committed. A sync
is complete when the three match the same daemon commit and the verification
ladder passes.

All generators read the wavelength checkout at `../wavelength` or
`$WAVELENGTH_DIR`. There may be no directory literally named `wavelength`, so
find it by remote (`github.com/lightninglabs/wavelength` in `git remote -v`,
under any remote name), not by directory name. Do not move the shared checkout
to the target commit: it is often behind the remote and may have local edits,
so a fast-forward or stash disturbs someone else's working tree. Use a
throwaway worktree instead:

```sh
cd <daemon checkout> && git fetch <remote> --tags
# <target> is the release tag (v<X.Y.Z>) or, when preparing a sync ahead of
# the tag, the daemon commit SHA. rev-parse on an annotated tag returns the
# tag OBJECT hash, so always dereference with ^{commit}.
git worktree add --detach /tmp/wavelength-<version> '<target>^{commit}'
export WAVELENGTH_DIR=/tmp/wavelength-<version>            # absolute path
# ... run the whole sync ...
cd <daemon checkout> && git worktree remove --force /tmp/wavelength-<version>
```

## What changed upstream -> what to touch here

| Upstream change | Regenerate | Hand-update |
|---|---|---|
| Facade type fields (`sdk/wavewalletdk`) | `pnpm gen:types` | Consumers of renamed fields (`git grep <old_field>` across `packages/`, `apps/`). Every RPC verb is mapped once in `packages/core/src/base-client.ts`; transports supply only `callRaw`. `requests.ts`/`results.ts` stay hand-authored (see `docs/codegen.md`) |
| WalletService RPC added/removed | `pnpm gen:api-docs` | The RPC checklist below |
| RPC/field doc comments only | `pnpm gen:api-docs` | Nothing (pages render from wallet.json) |
| DaemonService RPCs/messages (`waverpc/daemon.proto`) | Nothing | wallet.json covers `WalletService` ONLY, so an empty wallet.json diff after a large daemon.proto change is expected, not a generator failure. It lands as CLI/prose docs work (step 4); `wavecli` is the DaemonService client, so check `cmd_*.go` |
| wavecli flags/commands | Nothing | The command's page in `apps/docs/src/content/docs/cli/`; a new top-level command also needs a `CLI_NAV` entry. A REMOVED one must be deleted in lockstep: its `cli/<cmd>.mdx`, its `CLI_NAV` entry, its row in the `cli.mdx` table, and its slug in `apps/docs/tests/cli.spec.ts`'s hardcoded slug list (`git grep -n <cmd> apps/docs` finds stragglers) |
| Daemon operational facts (ports, TLS, build tags, gateway behavior) | Nothing | `apps/docs/src/content/docs/api/get-started.mdx` and `api/rest.mdx`; `cli.mdx` global flags/exit codes |
| Wasm runtime build | `wasm:local` (step 5) | Bump the pin first |
| Runtime asset FILE LIST | Nothing | Three places in lockstep: `packages/web/src/runtime-manifest.ts` (`RUNTIME_ASSET_FILES`), `apps/web-wallet-demo/scripts/wasm-local.sh`, `apps/web-wallet-demo/scripts/fetch-runtime-assets.sh`. A fourth lives upstream in wavelength's `mobile-bindings.yml`, which packs the release archive |
| Gomobile facade (`sdk/wavewalletdk/mobile`) | Nothing | Native SDK docs checkpoint (below) |

## RPC checklist

Adding or removing a WalletService RPC touches more places than any other
change class:

- **`packages/core`**: interface in `client.ts`, types in `requests.ts` /
  `results.ts`, impl in `base-client.ts` (one place; transports pipe
  `callRaw`), the barrel `index.ts`, and `testing/fake-client.ts` (it
  `implements WavelengthClient`, so a missing method fails typecheck).
- **Docs config**: `API_NAV` in `apps/docs/src/config/nav.ts` (it is there,
  below the SDK `NAV` array); `API_CLI`, `API_CLI_INVOCATION`, `API_SAMPLES`
  in `config/api.ts`; any new inline reference type in `config/api-links.ts`
  (`coreSymbols` + `inlineTypeOwners`), or its deep link will not resolve.
- **Reference prose**: only
  `apps/docs/src/content/docs/reference/wavelength-core.mdx`. The web and RN
  pages re-export core and carry no method list.
- **Docs tests hardcoding the method count**: `apps/docs/tests/nav.spec.ts`
  and `api-data.spec.ts` assert a literal, as both a numeral and an English
  word, so grep for both. `api-method.spec.ts` and `agent-artifacts.spec.ts`
  iterate every method, so the new page must build and be reachable.

## Ordered procedure

```sh
export WAVELENGTH_DIR=/absolute/path/to/wavelength   # a worktree at the
                                                     # release (see Overview)
```

1. **Pin**: set `RUNTIME_MANIFEST_VERSION` in `packages/core/src/version.ts`
   to the release tag (`v0.1.0`), or to the daemon short commit hash when
   preparing a sync ahead of the tag. Keep the exact single-quoted literal
   form; `scripts/runtime-version.mjs` parses the source text. A hash pin is
   the normal way to get a sync reviewed before the release exists: open the
   PR on the hash, then flip to the tag before merging. CI's `runtime-pin` job
   stays red until the pin names a published release, so expect it red for the
   whole review, and never merge it red.
2. **Types**: `pnpm gen:types` (needs Go + tygo). Review the generated.ts
   diff, then grep-and-fix hand-authored consumers per the table. Two upstream
   changes surface as generator problems, both fixed in `scripts/gen-types.mts`
   and never by hand-editing generated.ts:
   - A build failure `'any' only refers to a type` means the facade added an
     exported scalar const assigned from another package (e.g.
     `MaxSigningWorkers = waved.MaxSigningWorkers`); tygo cannot inline the
     value and emits `export const X = any /* ... */;`. gen-types strips such
     unresolved consts; extend that strip if a new shape slips through.
   - Em-dashes in upstream Go doc comments reach generated.ts verbatim.
     gen-types sanitizes them to hyphens, so if the em-dash check trips on
     generated.ts, the sanitizer regressed.
3. **API data**: `pnpm gen:api-docs`. Its gates fail loudly by design:
   - Nav drift: update `API_NAV` (and the curation maps in `config/api.ts`),
     then re-run. Never weaken the check.
   - Missing doc comments: fix by adding comments upstream in wallet.proto,
     never by tolerating empty descriptions.
   - Run it twice; the second run must produce a byte-identical wallet.json.
   - Sample keys in `API_SAMPLES` must be real request field names (a spec
     enforces this).
4. **CLI/prose docs**: author from wavelength source
   (`cmd/wavecli/waveclicommands/cmd_*.go`: `Flags()` registrations with
   defaults, and which RPC the `RunE` calls), NEVER from `--help` output
   (build tags hide commands, and help text omits exit codes and JSON shapes).
   Every subcommand gets its own `###` section with its own flags table.
   Verify operational claims against `waved/config.go` and
   `gateway_server.go`.
5. **Runtime assets**: `pnpm --filter web-wallet-demo run wasm:local` (builds
   from `$WAVELENGTH_DIR` into `public/runtime/<version>/`; bump the pin first
   or it stages under the OLD version). The deploy instead fetches
   `Wavewalletdk.wasm.tar.gz` from the release named by the pin. That archive
   lands on a DRAFT release and draft assets are not publicly downloadable, so
   a tag-shaped pin that `runtime-pin` still rejects usually means the release
   is unpublished, not that the pin is wrong.
6. **Native SDK docs**: run the checkpoint below. It is cheap and usually a
   no-op, but nothing else in this procedure catches native-page drift.
7. **Versions + commits**: the packages version in lockstep with the daemon
   pin; set every `packages/*/package.json` version to the pinned release
   (without the `v`) so the release workflow's tag check passes. Commits use
   bare area prefixes (`core:`, `web:`, `docs:`, `demo:`), one logical change
   each, every commit building on its own.
8. **Publish**: after the sync merges, create a GitHub release tagged with
   the pin (e.g. `v0.2.0`). Publishing that release triggers release.yml,
   which verifies the tag against the package versions and the pin, then
   publishes all four packages to npm. Nothing publishes until this release
   is cut. Full procedure and failure modes: RELEASE.md at the repo root.

## Verification ladder (run in this order)

```sh
pnpm build && pnpm typecheck        # build FIRST; typecheck resolves dist/*.d.ts
pnpm test:api-docs                  # extractor unit tests
pnpm --filter @lightninglabs/wavelength-web test
# Docs Playwright: its webServer has reuseExistingServer:true on port 4321, so
# it will silently attach to a stale preview from another worktree/session and
# serve an OLD build (a 404 for a brand-new page is almost always this, not a
# code bug). Pass a free PORT so it builds and serves THIS worktree fresh:
PORT=4399 pnpm --filter @lightninglabs/wavelength-docs test
WAVELENGTH_DIR=... pnpm --filter web-wallet-demo run wasm:local && \
  pnpm --filter web-wallet-demo run build && \
  pnpm --filter web-wallet-demo run test   # Playwright smoke test: gold standard

# No em-dash, ever. `git grep -nP '\x{2014}'` fails on git builds without
# Unicode \x{} PCRE; this perl form is portable:
perl -CSD -ne 'print "$ARGV:$.\n" if /\x{2014}/' $(git ls-files packages apps scripts)
```

A *deterministic* smoke-test failure is often a legitimate daemon behavior
change rather than a regression. Read the trace's page snapshot
(`test-results/.../error-context.md`) before assuming the wallet broke, then
move the assertion to the new behavior. Do not skip the test.

## Native SDK docs checkpoint (wavelength-mobile)

`apps/docs/src/content/docs/native-ios-android/` condenses the
wavelength-mobile repo. Find that checkout by a remote of
`lightninglabs/wavelength-mobile`; older clones may carry the pre-rename
`lightninglabs/damobile` URL, which GitHub redirects. Match the full path, not
a prefix, or `lightninglabs/wavelength` will match and land you on the daemon.

These pages track wavelength-mobile's published state, not the daemon tag, so
they never block a sync. After the main sync:

1. **Run the mini-pass every time**, even when `sdk/wavewalletdk/mobile` did
   not change: wavelength-mobile can rename types or rewrite its docs with no
   daemon release at all, so an unchanged facade is not evidence the pages are
   accurate. Each page opens with an MDX comment naming its upstream basis;
   diff its claims and snippets against that basis and confirm outbound links
   resolve. Three pages, and the quickstart's snippets are the only code.
2. If `sdk/wavewalletdk/mobile` changed in the range
   (`git -C $WAVELENGTH_DIR diff --stat <pin>..<target> -- sdk/wavewalletdk/mobile`)
   but wavelength-mobile has not adopted it yet, file a `.tasks/` follow-up and
   finish the sync. The pages stay truthful meanwhile, since they describe the
   published wrapper and link out for volatile detail.

## Common mistakes

- Guessed package filters: the docs app is `@lightninglabs/wavelength-docs`,
  the web package is `@lightninglabs/wavelength-web`, the demo is
  `web-wallet-demo`.
- Hand-editing `apps/docs/src/data/api/wallet.json` or
  `packages/core/src/generated.ts`. Both are generated and committed.
- Documenting CLI flags from `--help` or memory instead of `cmd_*.go`.

## After the sync: improve this skill

Every release differs, so propose concrete edits to THIS file before
finishing, and apply them on approval. The test for a candidate edit: would it
help on a typical sync, or only on the exact change this release happened to
carry? Durable environment facts and recurring change CLASSES belong here; a
lesson tied to one field, file, or command quirk is a one-off that is easy to
rediscover, so leave it out. Correct stale instructions rather than noting
them, prune what the run proved obsolete, keep additions terse (name the file,
the symptom, the fix), and propose the diff rather than committing it.

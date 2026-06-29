# Type generation (`pnpm gen:types`)

`packages/core/src/generated.ts` is **generated** from the daemon's Go facade
types (`sdk/walletdk` in [darepo-client](https://github.com/lightninglabs/darepo-client)),
which are the source of truth for the JSON the wasm runtime returns. Generating
them keeps the TypeScript types in lock-step with the daemon instead of being
hand-maintained (and drifting).

The pipeline runs [`tygo`](https://github.com/gzuidhof/tygo) (Go struct → TS) and
then post-processes the field names to camelCase using the shared `camelKey`
(`packages/core/src/casing.ts`), the same function the runtime uses to map
responses, so the generated types and the values the client returns always agree.

## When to run it

Only when the daemon's facade types change. The generated file is **committed**,
so SDK consumers never need any of the tooling below; they just install the
package.

```sh
pnpm gen:types
```

## System requirements (maintainers only)

| Requirement | Why | Install |
|---|---|---|
| **Node ≥ 24** | the generator is `scripts/gen-types.mts`, run with Node's native TypeScript stripping (no extra loader) | https://nodejs.org/ |
| **Go toolchain** | tygo loads the Go package; matches `darepo-client/go.mod` | https://go.dev/dl/ |
| **tygo** | generates TS from the Go structs | `go install github.com/gzuidhof/tygo@latest` |
| **darepo-client checkout** | the generation source | sibling at `../darepo-client`, or set `DAREPO_DIR=/path/to/darepo-client` |

After `go install`, ensure `tygo` is reachable; the script looks in
`$(go env GOPATH)/bin` and then on `PATH`. Both `go` and `tygo` must be runnable.

This is the same Go + `darepo-client` requirement the demo's `wasm:local` already
has (it builds the wasm runtime from the same checkout).

## What it does NOT do

- It does **not** touch `darepo-client`; it only reads it (no wire-format change).
- Request types and the `WalletDKClient` interface stay hand-authored
  (`packages/core/src/requests.ts` and `packages/core/src/client.ts`): requests
  carry real semantics (base64-encoding `[]byte` password fields, config folding)
  that a casing transform can't express, so those keep explicit mappers in
  `packages/web`.

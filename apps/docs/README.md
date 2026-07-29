# docs

The documentation site for [Wavelength](../../README.md), published at
[wavelength.lightning.engineering](https://wavelength.lightning.engineering).
A custom-themed Astro site in three slices: the SDK docs (web and React
Native guides, concepts, and the per-package reference), the wallet API
reference, and the CLI reference.

## Develop

From the repository root:

```sh
pnpm install && pnpm build
pnpm --filter @lightninglabs/wavelength-docs run dev
```

## Build and test

```sh
pnpm --filter @lightninglabs/wavelength-docs run build
pnpm --filter @lightninglabs/wavelength-docs run test
```

The build also produces the agent artifacts (llms.txt and friends) via the
`postbuild` script.

## Generated content

The wallet API reference is driven by `src/data/api/wallet.json`, regenerated
by `pnpm gen:api-docs` at the repository root from the wavelength daemon's
proto definitions. The output is committed, so docs builds never need the Go
checkout; regenerate it only when the daemon's wallet API changes.

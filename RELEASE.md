# Releasing

Publishing to npm is driven entirely by GitHub releases: create a release
tagged `vX.Y.Z` and the [release workflow](.github/workflows/release.yml)
validates it, builds the packages, and publishes all four to npm. There is
nothing to run locally and no npm credentials to hold.

## Versioning

The four packages (`core`, `web`, `react`, `react-native`) always share one
version, and that version is the daemon release the SDK is paired with:
`RUNTIME_MANIFEST_VERSION` in `packages/core/src/version.ts`. So SDK `0.2.0`
runs against [wavelength](https://github.com/lightninglabs/wavelength)
`v0.2.0`, always. There is no independent SDK versioning to reason about.

This means a release starts with a daemon sync: the pin, the generated types,
and the runtime assets all move together. The version bump is part of that
sync PR, not a separate step.

## Cutting a release

1. Land the sync PR that bumps `RUNTIME_MANIFEST_VERSION` to the new daemon
   release and sets every `packages/*/package.json` version to match (the
   version drops the `v`, so pin `v0.2.0` means version `0.2.0`).
2. On [the releases page](https://github.com/lightninglabs/wavelength-sdk/releases),
   create a new release with a new tag `vX.Y.Z` matching the pin, targeting
   `main`. Write the release notes; drafting first is fine, the workflow only
   runs when the release is published. For a prerelease version, check the
   "Set as a pre-release" box; the workflow fails if the box and the version
   disagree.
3. Publish the release. The workflow fires, checks that the tag, the daemon
   pin, and all four package versions agree, builds, and publishes to npm.
4. Confirm the run succeeded in the
   [Actions tab](https://github.com/lightninglabs/wavelength-sdk/actions/workflows/release.yml)
   and spot-check one package on npm.

If the workflow fails at the version check, the release was cut before the
sync landed (or the tag has a typo). Fix the mismatch and re-publish: deleting
and recreating the release, or editing the tag, both re-trigger the workflow.
Re-running is safe at any point; versions already on npm are skipped rather
than republished.

## How publishing authenticates

The workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers):
npmjs.com trusts this repository's `release.yml` workflow directly via OIDC.
There is no `NPM_TOKEN` secret to rotate or leak, and every publish gets
provenance attestations for free.

Each package carries this configuration on npmjs.com (package Settings >
Trusted Publisher: this repo, workflow `release.yml`). A new package needs
that set up once by an npm org owner before its first workflow publish;
without it the publish step fails with an auth error.

## Prereleases

When the daemon ships an RC, lockstep versioning means the SDK version is a
prerelease too (daemon `v0.3.0-rc1` means SDK `0.3.0-rc1`). The workflow
derives the npm dist-tag from the version: a stable `x.y.z` lands on
`latest`, and a prerelease (any version with a hyphen) lands on `next`. A
plain `npm install` keeps resolving the last stable release; testers opt in
with:

```sh
npm install @lightninglabs/wavelength-web@next
```

When the stable version ships, it lands on `latest` as usual and `next` just
falls behind until the next RC. Nothing needs cleaning up between cycles.

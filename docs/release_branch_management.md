# Release Branch Management

## Overview

This document describes the branch management workflow for dawallet releases.
The `main` branch remains open for merges at all times. Release stabilization
happens on dedicated release branches, with CI automation handling backports of
labeled changes. Package versions and npm publishing are driven by
[Changesets](https://github.com/changesets/changesets).

## Branch Model Principles

**Main is always open.** Developers merge approved pull requests at any time,
with no coordination around release windows and no merge freezes.

**Each major release gets a dedicated branch.** When cutting a new major
version, we branch from `main` as `v0.1.x-branch`. That branch carries every
patch release for the version series.

**CI automation handles backports.** Pull requests merged to `main` and labeled
`backport-v*` are automatically backported to the matching release branch. See
[backport-workflow.md](backport-workflow.md).

**Changes flow one direction only.** Changes move from `main` to release
branches, never in reverse.

## Versioning with Changesets

Package versions live in each publishable workspace under `packages/`
(`core`, `web`, `react`); the repository root is `private` and carries no
version. Day-to-day, contributors add a changeset describing their change:

```bash
pnpm changeset
```

On `main`, versions and changelogs are applied from accumulated changesets with
`pnpm version-packages` (`changeset version`), and packages are published with
`pnpm release` (`changeset publish`). The `web-wallet-demo` and
`@lightninglabs/walletdk-docs` workspaces are ignored by Changesets and are not
versioned.

## Major Release Process

When ready to begin a major release (for example, the `0.1` series):

1. Create a release branch from `main`: `git checkout -b v0.1.x-branch main`
2. Push the branch: `git push origin v0.1.x-branch`
3. On the release branch, set the publishable packages to the release version
   (`0.1.0`) via a pull request against `v0.1.x-branch`. Either run
   `pnpm changeset version` with a `0.1.0` changeset, or set the `version` field
   in `packages/{core,web,react}/package.json` directly.
4. Configure branch protection for `v0.1.x-branch` on GitHub.
5. Create the `backport-v0.1.x-branch` label so backport automation can route
   fixes to the branch.

### Tagging and Publishing the Release

After the version PR merges onto the release branch, tag it and publish from the
release branch:

```bash
git checkout v0.1.x-branch
git pull
git tag v0.1.0
git push origin v0.1.0
pnpm release   # changeset publish
```

## Minor Release Process

Patch releases reuse the existing release branch. When a fix is needed for
`0.1.0`:

1. Develop and merge the fix to `main`.
2. Add the `backport-v0.1.x-branch` label so CI backports it.
3. On the release branch, bump the publishable packages to `0.1.1` via a pull
   request against `v0.1.x-branch`.
4. After the PR merges, tag and publish: `git tag v0.1.1 && git push origin
   v0.1.1 && pnpm release`.

Multiple patch releases (0.1.1, 0.1.2, …) live on the same `v0.1.x-branch`.

## Manual Cherry-Picking

When a fix applies only to a release branch and not to `main`, cherry-pick it
directly and open a PR into the target release branch:

```bash
git checkout v0.1.x-branch
git cherry-pick <commit-hash>
git cherry-pick --continue   # if conflicts
```

Document why the normal backport flow was bypassed, and make sure any change
that should also exist on `main` lands there too.

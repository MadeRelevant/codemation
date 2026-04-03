# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to record semver impact before merge.

- **On a PR:** add a changeset when your change should drive a published package version (`pnpm changeset`). CI runs `changeset status` on pull requests.
- **On `main`:** the [Changesets workflow](../.github/workflows/changesets-version.yml) opens or updates the **Version Packages** PR.
- **Publishing:** npm releases follow [`publish-npm.yml`](../.github/workflows/publish-npm.yml) on `v*` tags after versions are merged.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the contributor workflow.

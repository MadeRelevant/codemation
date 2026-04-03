# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to record semver impact before merge.

- **Changelog format:** [`@changesets/changelog-github`](https://github.com/changesets/changesets/tree/main/packages/changelog-github) enriches package `CHANGELOG.md` files with GitHub PR/commit links (configure in [`config.json`](./config.json)). Running `pnpm changeset version` **locally** needs a **`GITHUB_TOKEN`** with `repo` scope so the generator can call the GitHub API (`export GITHUB_TOKEN=…`).
- **On a PR:** add a changeset when your change should drive a published package version (`pnpm changeset`). CI runs `changeset status` on pull requests.
- **On `main`:** the [Changesets workflow](../.github/workflows/changesets-version.yml) opens or updates the **Version Packages** PR on branch **`release/version-packages`** (not full CI on that PR; merge with maintainer bypass—see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).
- **Publishing:** npm releases follow [`publish-npm.yml`](../.github/workflows/publish-npm.yml) on `v*` tags after versions are merged. That workflow also creates a **GitHub Release** whose notes are taken from the **`@codemation/core`** section in [`packages/core/CHANGELOG.md`](../packages/core/CHANGELOG.md) for that version (release anchor).

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the contributor workflow.

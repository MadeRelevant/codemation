---
"@codemation/create-codemation": major
---

**Breaking:** managed workspace template now declares `@codemation/cli`, `@codemation/core`, `@codemation/core-nodes`, `@codemation/core-nodes-gmail`, and `@codemation/host` as real `dependencies` (moved from `peerDependencies`). These are installed at workspace pod boot via `pnpm install --frozen-lockfile` against the in-cluster Verdaccio registry (`verdaccio.control-plane.svc.cluster.local:4873`).

Changes:

- `packaging/workspace-host/Dockerfile` rewritten as a tiny base image (~100 MB compressed). No framework code baked in — image provides only Node 22, pnpm, tini, and aws-cli.
- `packages/create-codemation/templates/managed/.npmrc` added, pointing `pnpm install` at the in-cluster Verdaccio.
- `packages/create-codemation/templates/managed/pnpm-lock.yaml` added; generated against npmjs (registry-agnostic, compatible with Verdaccio proxy at boot).
- `.github/workflows/publish-workspace-host.yml` updated: version-strictness gate removed; workflow builds and tags the tiny image on any `v*` tag push.

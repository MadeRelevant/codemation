---
"@codemation/cli": minor
---

Move `@codemation/next-host` from `devDependencies` to optional `peerDependencies` in `@codemation/cli`.

**Why**: Consumers who only use the headless API path (`codemation serve web --headless`, which is what workspace pods run) no longer pull in `@codemation/next-host` and its transitive deps (Next.js, `@next/swc-*`, ~150 MB) as a transitive of `@codemation/cli`. The headless path never imported next-host — all accesses were already lazy `require.resolve` calls inside non-headless command methods.

**Action required for consumers using the UI path**: If you run `codemation serve web` (without `--headless`) or `codemation dev`, install `@codemation/next-host` directly in your project.

---

**Also in this PR**:

- Added `.github/workflows/publish-workspace-host.yml`: auto-publish the `ghcr.io/maderelevant/codemation-workspace-host` Docker image on `v*` tag push (same trigger as npm publish). Tags both `:<version>` (immutable) and `:<major>` (rolling). Skips rebuild if the immutable tag already exists and only updates the rolling pointer via `imagetools create`.

- No source changes needed in `packages/cli/src/`: all next-host accesses were already inside non-headless command method bodies (no static top-level imports).

- `googleapis` in `packages/core-nodes-gmail/` is already lazy-loaded via `await import("googleapis")` inside `GoogleGmailSessionFactory.ts` — no change needed.

**Image size note**: On the current branch baseline, the Docker image is 3.74 GB uncompressed / ~937 MB compressed. Due to pnpm 10's `auto-install-peers=true` behavior, pnpm auto-resolves the optional workspace peer dep and records `@codemation/next-host` as a lockfile dependency of cli — meaning `--prod --filter @codemation/cli` still installs it. The consumer-facing dep declaration is correct; closing the Docker gap requires a Dockerfile-side post-install pruning step (tracked as follow-up). The planning doc's original expectation of pnpm skipping the workspace peer was incorrect for pnpm 10.

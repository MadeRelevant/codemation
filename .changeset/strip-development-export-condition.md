---
"@codemation/canvas": patch
"@codemation/core": patch
"@codemation/host": patch
---

Remove the `development` export condition from `@codemation/canvas`, `@codemation/core`, and `@codemation/host` package.json exports. Module resolution now consistently uses the built `dist/` regardless of `NODE_ENV`.

**Why:** the `development` condition is auto-applied by bundlers (Next.js dev mode, Vite dev, etc.) and was making every cross-repo monorepo consumer fall through to TypeScript source. For the framework's own `@codemation/next-host`, this was fine — turbo's `dev` already runs `tsdown --watch` on these packages so dist is always fresh in dev. For external consumers (notably the managed control plane), it caused multi-hundred-file recursive source compiles on every cold page load.

**Impact:** zero behavior change for normal users (they consume published `dist/`). Framework monorepo devs editing canvas/core/host source still see live updates as long as `tsdown --watch` is running for the package — which is what `pnpm dev` (turbo) orchestrates by default. If you're running an app in isolation without the package's watch task, you now need to start it explicitly.

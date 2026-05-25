---
"@codemation/cli": minor
"@codemation/core-nodes": patch
"@codemation/host": patch
---

Shrink workspace-host Docker image by decoupling CLI from next-host at runtime.

`@codemation/cli`: demote `@codemation/next-host` from `dependencies` to `devDependencies`. The CLI's
non-headless serve path resolves the next-host package at runtime via `require.resolve()`; the
headless path (used by workspace-host pods) never touches it. Consumers that install `@codemation/cli`
from the registry and need the UI shell must add `@codemation/next-host` as a direct dependency.

`@codemation/core-nodes`: demote `lucide-react` from `dependencies` to `devDependencies`. The package
only references lucide icon names as strings (e.g. `"lucide:bot"`); it never imports the react library
at runtime. This removes ~46 MB from runtime installs of `@codemation/core-nodes`.

`@codemation/host`: promote `execa` and `dotenv` from `devDependencies` to `dependencies`. Both are
required at Dockerfile build time by `scripts/generate-prisma-clients.mjs` (imports `execaSync` from
`execa`) and `prisma.config.ts` (imports `dotenv/config`). These files run during `prisma:generate`
which executes in the production builder stage with `--prod` install (no devDeps available).

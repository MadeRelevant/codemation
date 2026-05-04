# Codemation plugin starter

This template scaffolds a plugin package around `codemation.plugin.ts` and a publishable root package API in `src/index.ts`.

1. `pnpm install`
2. `pnpm dev`
3. Open the printed local URL to inspect the sandbox app.

This template already includes `AGENTS.md` and packaged Codemation skills under `.agents/skills/extracted`, so coding agents can load plugin-specific guidance immediately.

What you get:

- `codemation.plugin.ts` with `definePlugin(...)` and a sandbox app via `defineCodemationApp(...)`
- a sample credential type in `src/credentialTypes` built with `defineCredential(...)`
- a sample custom node in `src/nodes` built with `defineNode(...)` / **`executeOne`**
- `src/index.ts` as the canonical import surface for consumers
- package metadata and `tsdown.config.ts` that emit real `dist/index.*` and `dist/codemation.plugin.*` entrypoints
- a sandbox workflow that exercises the custom node immediately with `workflow("...")`

When you are ready to publish, keep these principles:

- consumers should import your package root, not `dist/**` or private source paths
- `src/index.ts` is the public API you intend to support
- `package.json#codemation.plugin` must point at built JavaScript such as `./dist/codemation.plugin.js`
- `main` / `module` / `types` / `exports` should point at real `dist/index.*` files after `pnpm build`

Installing the package in a Codemation app is enough for plugin auto-discovery in the common case.

# Codemation plugin starter

This template scaffolds a plugin package around `codemation.plugin.ts`.

1. `pnpm install`
2. `pnpm dev`
3. Open the printed local URL to inspect the sandbox app.

What you get:

- `codemation.plugin.ts` with `definePlugin(...)` and a sandbox app via `defineCodemationApp(...)`
- a sample credential type in `src/credentialTypes` built with `defineCredential(...)`
- a sample custom node in `src/nodes` built with `defineNode(...)`
- a sandbox workflow that exercises the custom node immediately with `workflow("...")`

When you are ready to publish, run `pnpm build` and publish the package like any other npm package. Installing the package in a Codemation app is enough for auto-discovery in the common case.

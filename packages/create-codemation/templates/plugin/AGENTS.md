# AGENTS.md

## Start Here

This repository was scaffolded from the Codemation `plugin` starter.

Before making substantive changes, read the relevant Codemation skills first.

Start with the skills under `.agents/skills/extracted/`:

- `codemation-plugin-development`
- `codemation-custom-node-development`
- `codemation-credential-development`
- `codemation-framework-concepts`
- `codemation-cli`

If a project-local skill exists under `.agents/skills/` outside `extracted/`, treat it as more specific guidance.

## Project Shape

- `codemation.plugin.ts` is the plugin composition root.
- `src/nodes/` contains reusable custom nodes.
- `src/credentialTypes/` contains reusable credential definitions.
- `src/index.ts` is the public package export surface.

## Working Rules

- Prefer `definePlugin(...)`, `defineNode(...)`, and `defineCredential(...)` before dropping to lower-level runtime APIs.
- Keep plugin registration separate from node and credential implementation modules.
- Use the sandbox app to verify plugin behavior quickly.
- Follow any repo-root `AGENTS.md` or nested `AGENTS.md` files you find in subdirectories.

## Commands

- Install deps: `pnpm install`
- Run plugin dev: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Unit tests: `pnpm test` (uses `WorkflowTestKit` from `@codemation/core/testing`; see Codemation docs)

## Guardrails

- Do not delete or rewrite `.agents/skills/extracted` unless the user explicitly asks.
- Prefer changing plugin source files over editing vendored skill files.
- Treat this package like a normal publishable npm package: keep entrypoints, exports, and plugin wiring intentional.

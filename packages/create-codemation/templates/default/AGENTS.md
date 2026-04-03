# AGENTS.md

## Start Here

This repository was scaffolded from the Codemation `default` starter.

Before making substantive changes, read the relevant Codemation skills first.

Start with the skills under `.agents/skills/extracted/`:

- `codemation-cli`
- `codemation-workflow-dsl`
- `codemation-custom-node-development`
- `codemation-credential-development`
- `codemation-framework-concepts`

If a project-local skill exists under `.agents/skills/` outside `extracted/`, treat it as more specific guidance.

## Project Shape

- `codemation.config.ts` is the app composition root.
- `src/workflows/**/*.ts` contains workflow definitions.
- Add custom nodes or credential registrations only when inline workflow logic stops being a good fit.

## Working Rules

- Prefer the Codemation workflow DSL for normal workflow authoring.
- Keep workflow files focused on orchestration, not large implementation blocks.
- When credentials or reusable behavior appear, move that logic behind explicit node or credential boundaries.
- Follow any repo-root `AGENTS.md` or nested `AGENTS.md` files you find in subdirectories.

## Commands

- Install deps: `pnpm install`
- Run dev: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`

## Guardrails

- Do not delete or rewrite `.agents/skills/extracted` unless the user explicitly asks.
- Prefer updating local project code and docs over editing vendored skill files.
- Use `README.md` for human-facing project documentation and this file for agent workflow guidance.

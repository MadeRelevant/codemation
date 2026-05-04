---
name: codemation-cli
description: Guides Codemation CLI work for consumer apps and framework-author development. Use when the user asks about `codemation dev`, `build`, `serve web`, `serve worker`, `user create`, `user list`, `--consumer-root`, `.codemation/output`, or consumer versus framework-author mode.
compatibility: Designed for Codemation repositories and projects that use the Codemation CLI.
---

# Codemation CLI

## Use this skill when

Use this skill for command selection, local development flow, and CLI troubleshooting in a Codemation app or monorepo.

Do not use this skill for workflow graph design, custom node implementation, or credential modeling unless the CLI command flow is the main question.

## Default approach

1. Confirm whether the user is in a standalone consumer project or the Codemation monorepo.
2. Prefer `codemation --help` or `codemation <command> --help` before guessing flags.
3. Explain the shortest command path first, then mention framework-author alternatives only if they matter.
4. Keep the CLI thin in your mental model: it orchestrates host and runtime packages instead of owning workflow logic itself.

## Command map

- `codemation dev`: default consumer development flow with packaged UI and a stable CLI-owned dev gateway.
- `codemation dev --watch-framework`: framework-author mode for monorepo work and `next-host` UI HMR.
- `codemation build`: emits production-oriented consumer output under `.codemation/output/build`.
- `codemation serve web`: runs the packaged web host for a built or configured consumer app.
- `codemation serve worker`: starts the queue-backed worker runtime when execution is separated.
- `codemation user create` and `codemation user list`: local-auth bootstrap and inspection commands.

## Working rules

1. Treat `codemation.config.ts` as the consumer entrypoint.
2. Mention `.codemation/output` only when build artifacts or runtime bootstrap details matter.
3. When the user is in the monorepo, distinguish framework-author mode from normal consumer mode explicitly.
4. When Redis-backed execution is involved, mention the shared PostgreSQL requirement instead of assuming local SQLite still fits.
5. In consumer mode, discovered plugins are loaded from the built JavaScript path declared in `package.json#codemation.plugin`, not from TypeScript source under `node_modules`.
6. In plugin mode, the CLI TypeScript-loads only the current plugin repo through the generated `.codemation/plugin-dev/codemation.config.ts`.
7. In the Codemation framework monorepo, automatic refresh of `.agents/skills/extracted` is intentionally disabled to keep the worktree clean.
8. After `@codemation/cli` or `@codemation/agent-skills` package upgrades in monorepo work, remind the user to run `codemation skills sync` if they want the extracted packaged skills refreshed.

## Read next when needed

- Read `references/command-map.md` for command responsibilities and development-mode guidance.

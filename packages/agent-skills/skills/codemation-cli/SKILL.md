---
name: codemation-cli
description: Guides Codemation CLI work for consumer apps and framework-author development. Use when the user asks about `codemation dev`, `build`, `serve web`, `serve worker`, `user create`, `user list`, `--consumer-root`, `.codemation/output`, or consumer versus framework-author mode.
compatibility: Designed for Codemation repositories and projects that use the Codemation CLI.
tags: cli, dev
---

# Codemation CLI

## Mental model

The CLI is a thin orchestrator: it loads `codemation.config.ts`, delegates to `@codemation/host` (web server) and worker packages, and manages build artifacts in `.codemation/output/`. It owns no workflow logic. There are two modes: **consumer mode** (`codemation dev`) runs a stable packaged UI against the consumer's workflows; **framework-author mode** (`codemation dev --watch-framework`) enables `next-host` HMR for monorepo development.

## When to use / when NOT

Use this skill for command selection, local development flow, and CLI troubleshooting.
Do not use for workflow graph design, custom node implementation, or credential modeling unless the CLI command is the core question.

## Quickstart

```
codemation dev                        # consumer development (default)
codemation dev --watch-framework      # framework-author / UI HMR (monorepo)
codemation build                      # emit .codemation/output/build
codemation serve web                  # run packaged web host
codemation serve worker               # start queue-backed worker
codemation user create                # bootstrap local-auth user
codemation user list                  # inspect auth users
```

Use `codemation --help` or `codemation <command> --help` before guessing flags.

## Decision branches & gotchas

**Standalone consumer vs monorepo:** confirm which context the user is in before suggesting commands. In the monorepo, distinguish framework-author mode from consumer mode explicitly.

**Plugin loading:** in consumer mode, plugins are loaded from the built JavaScript path declared in `package.json#codemation.plugin` — not from TypeScript source under `node_modules`. In plugin dev mode, the CLI TypeScript-loads only the current plugin repo through the generated `.codemation/plugin-dev/codemation.config.ts`.

**Redis-backed execution:** when Redis-backed execution is involved, mention the shared PostgreSQL requirement — local SQLite no longer fits.

**Skills sync:** after `@codemation/cli` or `@codemation/agent-skills` package upgrades in monorepo work, run `codemation skills sync` to refresh extracted packaged skills in `.agents/skills/extracted`. Automatic refresh is intentionally disabled in the monorepo worktree to keep it clean.

## Anti-patterns

- Do not guess CLI flags — use `codemation <command> --help`.
- Do not assume SQLite fits when Redis-backed workers are in play — check for the PostgreSQL requirement.

## Read next when needed

- Read `references/command-map.md` for command responsibilities and development-mode guidance.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these first

- **[`AGENTS.md`](AGENTS.md)** — authoritative architecture, DI rules, engine ↔ node contract, logging/forms/test conventions, ESLint architecture rules. Treat its rules as hard requirements.
- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — branch/PR workflow, husky pre-commit, changeset requirements, auth model.
- **[`docs/development-modes.md`](docs/development-modes.md)** — framework-author mode vs. consumer mode.

Don't duplicate guidance from those files here; defer to them.

## Repo shape

pnpm workspace + Turborepo monorepo. TypeScript everywhere, libraries bundled with **tsdown**, tests with **Vitest**.

- `packages/core` — engine, execution model, workflow DSL, public contracts. **Must stay pure** (no HTTP, UI, vendor SDKs, or node catalog).
- `packages/core-nodes`, `packages/core-nodes-gmail`, `packages/node-example` — built-in / example node packages. Adding a node package must not require core edits.
- `packages/host` — server-side host (Hono gateway, Prisma, DI container, auth). Multiple subpath exports (`/server`, `/client`, `/persistence`, `/credentials`, …) exist to keep server-only code out of browser bundles — respect those boundaries.
- `packages/next-host` — Next.js UI shell. Forms use **React Hook Form + Zod** via `@/components/forms` (see `packages/next-host/docs/FORMS.md`).
- `packages/cli` (`@codemation/cli`) — `codemation` CLI; entry `packages/cli/src/bin.ts`.
- `packages/create-codemation` — `npm create codemation@latest` scaffolder.
- `packages/eventbus-redis`, `packages/agent-skills`, `packages/e2e` — supporting packages.
- `apps/test-dev` — consumer-style smoke app for local dev. `apps/plugin-dev`, `apps/e2e`, `apps/docs`, `apps/prove-packaged-auth-fix` — focused harnesses.
- `tooling/{vitest,eslint-config,tsconfig,release,verdaccio,scripts,codemods,test}` — shared configs and internal tooling.

The engine activates nodes in **batch shape** (`Items` on `main`) but most nodes are **per-item** (`ItemNode` / `executeOne`); the DSL helpers (`.map`, `.if`, `.switch`) and plugin `defineNode(...)` follow the same per-item contract. `execute` must return the node's **output payload** on each port — see "Engine ↔ Node contract" in AGENTS.md before changing node shapes.

## Common commands (run from repo root)

Dev:

- `pnpm dev` — framework-author mode (delegates to `@codemation/test-dev`, source-first, no Turbo watch fanout).
- `pnpm run dev:consumer` — consumer mode against `apps/test-dev` (runs `codemation dev`, watches consumer files, hot-swaps `.codemation/output`).
- `pnpm codemation <args>` — run the CLI from source via `tsx` with `tsconfig.codemation-tsx.json`. Insert `--` after `codemation` if your shell swallows args.

Build / static checks:

- `pnpm build` (`turbo run build`)
- `pnpm typecheck`
- `pnpm run lint:eslint` — ESLint via turbo
- `pnpm run lint` — ESLint **plus** `dupcheck` (jscpd) and `antipatterns` (ast-grep)
- `pnpm run check` — full CI-equivalent: lint + typecheck + all test suites

Tests (suite split, all run in parallel under `pnpm test`):

- `pnpm run test:unit` — `tooling/vitest/unit.config.ts`
- `pnpm run test:integration` — `tooling/vitest/integration.config.ts` (host + cli integration; brings own Postgres / ephemeral ports / unique BullMQ Redis prefix)
- `pnpm run test:ui` — `tooling/vitest/ui.config.ts` (jsdom, `*.test.tsx`; `isolate: false` — save/restore globals manually)
- `pnpm run test:browser` — host browser tests
- `pnpm run test:e2e` — e2e placeholders
- `pnpm test` — `turbo run build` then all five suites in parallel
- `pnpm run coverage` — same suites with v8 lcov, merged to `coverage/lcov.info`

Iterating on one package: `pnpm --filter <pkg> test` (or `vitest path/to/file.test.ts` inside the package). Run a single test with `vitest -t "test name"`.

Husky pre-commit runs only **lint-staged + changeset:verify + `pnpm run precommit`** (eslint + typecheck + unit). Integration/UI/browser/e2e and full `pnpm lint` only run in CI — for substantive changes, run the closest realistic gate locally before declaring done (typically `pnpm run lint:eslint && pnpm typecheck && pnpm run test:unit`, or `pnpm run check` for cross-package work).

## Versioning / release

- Changesets is mandatory for any change to a publishable `packages/*`. Add `pnpm changeset` (or a `.changeset/*.md` file) before merge — pre-commit and CI both enforce it. `SKIP_CHANGESET_VERIFY=1` bypasses locally.
- Local registry smoke: `pnpm verdaccio` then `pnpm run local-release:publish` / `pnpm run local-release:smoke`.

## Logging and ESLint quirks worth knowing

- No `console.log` under `packages/*/src` (except `next-host` and `cli`); inject `LoggerFactory` / `Logger`. Under Vitest the default min level is `warn` — set `CODEMATION_LOG_LEVEL=debug|info|warn|error|silent` to override.
- ESLint forbids `vi.mock`, `vi.doMock`, `vi.stubGlobal`, `vi.unstubAllGlobals`, `vi.stubEnv` in tests — save/restore globals manually.
- ESLint enforces DI patterns under `packages/**/src`: no arbitrary `new PascalCase` outside composition-root files, no `static` methods, no exported free functions (with allowlisted suffixes like `Factory`, `Builder`, `Registry`, `Planner` and `*.types.ts` exceptions). One class per file. Rename or split files rather than fighting the rule. See `tooling/eslint-config/index.mjs`.

## Auth

`@codemation/host` is the single auth authority. Backend owns `/api/auth/*`; `next-host` is a thin UI shell — do not add NextAuth / Auth.js handlers there. Required env: `AUTH_SECRET`, plus `BETTER_AUTH_URL` or `CODEMATION_PUBLIC_BASE_URL`. See `docs/better-auth-host.md`.

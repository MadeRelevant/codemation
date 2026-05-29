# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Behavioral guidelines

Adapted verbatim from Andrej Karpathy's observations on LLM coding pitfalls
(via [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)).
These bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Way of working — Definition of Done

For any non-trivial change (anything beyond a one-line typo / comment / doc tweak), the work isn't done until all five steps below have happened, in order. Skipping a step is a tech-debt smell — call it out explicitly and explain why instead of silently moving on.

### 1. Map the story; confirm with stakeholders

Write or update the planning artifact before touching code. For sprint work that means a story file under `planning/sprints/<sprint-name>/<NN>-<slug>.md` with `Why`, `Decisions`, `Implementation plan`, `Deliverables`, `Verification`, `Parallelism`, and `Open questions` sections. For one-off fixes a paragraph in the issue / PR description is enough. **Confirm the plan with the user before implementing** — surface the open questions first, not after the change is half-built. Existing sprint examples: `planning/sprints/hitl/`, `planning/sprints/current/`.

### 2. Define test scenarios up front

Before writing implementation, name the scenarios you'll cover (happy path + each edge case + each failure mode). A short bullet list in the story or PR body is enough. The list becomes the spec for step 3 — if a scenario isn't on the list you don't have to implement, and if a scenario is on the list, the matching test must exist in step 3.

### 3. Write unit + integration tests alongside the code

For framework work this means **both**:

- **Unit tests** for the smallest verifiable shape (one class / one helper / one decision branch).
- **Integration tests** that exercise the real wiring — the real Prisma repository, the real DI container, the real engine. Pure-in-memory tests miss real wiring gaps: the HITL sprint surfaced five separate runtime bugs that only manifested when `PrismaWorkflowRunRepository` + tsx-dev module loading were in play (see `packages/host/test/hitl/hitlWiringGaps.integration.test.ts` for the regression suite that documents them). When in doubt, add the integration test.

Test file lives next to the code or under `packages/<pkg>/test/`. Follow the existing conventions (`*.test.ts` / `*.integration.test.ts`), and never use `vi.mock` / `vi.stubGlobal` / `vi.stubEnv` (forbidden by ESLint).

### 4. All gates clean

Run the closest realistic gate locally before declaring done:

- `pnpm run lint:eslint && pnpm typecheck && pnpm run test:unit` — the husky pre-commit minimum, fast feedback.
- For cross-package or persistence/engine changes: `pnpm run check` (lint + typecheck + every test suite). CI runs this same set; locals should be green first.
- New changeset under `.changeset/` for any change touching publishable `packages/*`.

Pre-commit may need `PRECOMMIT_TURBO_CONCURRENCY=1` when WSL is memory-constrained. Never skip hooks (`--no-verify`) unless the user explicitly asked.

### 5. Verify in the actual product via the MCP browser

Static analysis + tests can't see runtime issues like Turbopack chunk-loads, dev-mode module duplication, hot-reload reentry, or UI/UX regressions. **For any UI / engine / runtime change, drive the relevant flow in the browser using chrome-devtools MCP** (`mcp__chrome-devtools__*`) and confirm what you implemented actually does what it's supposed to. Take a snapshot or screenshot at the critical assertion point. If the change is library-only (no user-facing surface), document why browser verification doesn't apply.

If you can't get the browser verification working (dev server down, port conflict, unrelated regression), **say so explicitly** — don't claim a change is verified when it isn't. The whole HITL sprint surfaced this: every "fix it and move on" without browser verification led to another silent regression that only the next browser session caught.

---

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

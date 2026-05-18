# Codemation — Framework Overview

> High-level introduction to the Codemation framework. Intended as seed context
> for Claude projects (or any new contributor) so future conversations can skip
> the basics. Pairs with [`AGENTS.md`](../AGENTS.md) (authoritative architecture
> rules) and [`managed-platform-design.md`](./managed-platform-design.md)
> (where the framework is heading).

## What it is

Codemation is a **code-first automation framework** for TypeScript. It's
positioned in the same space as n8n / Zapier / Make — connect SaaS APIs,
process events, run workflows on triggers — but the workflow is **expressed
in code**, not in a visual builder or a YAML file.

The framework exists because automation built in click-and-drag tools hits a
ceiling fast: version control is awkward, testing is hard, AI agents can't
collaborate on it, and any non-trivial logic ends up smeared across dozens
of "Code" nodes anyway. Starting from code flips that — workflows are real
TypeScript, type-checked, testable, diffable, and (importantly for where the
project is going) **writeable by AI coding agents** within a regulated
framework that keeps them from going off the rails.

## The pitch in one paragraph

You write workflow definitions as TypeScript. The engine runs them, handling
triggers, queues, retries, item-level iteration, and execution state. Nodes
are pluggable units of work — Gmail, Slack, HTTP, AI agents, custom code —
that snap together via a fluent DSL. A Next.js host UI provides a control
plane for runs, credentials, observability. The whole thing is engineered
to be embeddable: you can run Codemation as a service on your own infra, as
a library inside a bigger app, or (eventually) on a managed platform that
provisions it for non-technical users.

## Where it's heading

Same framework, two consumption modes:

- **Self-hosted / framework mode** — developers build automations as code,
  deploy to their own infra. This is what exists today.
- **Managed platform mode** — non-technical users get a chat-first UX backed
  by a concierge agent (clarifies intent → drafts a plan → user approves)
  and a per-installation coding agent (writes the actual workflows inside
  a Firecracker microVM). The framework's code-first nature is what makes
  the agentic UX safe-ish: agents work within a regulated coding framework
  rather than generating arbitrary scripts.

See [`managed-platform-design.md`](./managed-platform-design.md) for the
managed-mode architecture.

## Core concepts

### Workflow

A directed graph of nodes. Has triggers (entry points) and processing nodes.
Defined in code via a fluent DSL. Persisted as a definition; runs are
ephemeral instances of an executed definition.

### Node

A unit of work in a workflow. Two flavors:

- **Trigger node** — an entry point. Listens for external events (HTTP
  webhook, schedule, mailbox poll, queue message) and emits items into the
  graph.
- **Processing node** — receives items on its input ports, does work, emits
  items on output ports.

Nodes are **plugins**. Adding a node package never requires editing core.
Each node has a config class (`NodeConfigBase`) and an implementation class
(`Node` / `TriggerNode` / `ItemNode`).

### Item

The unit of data flowing through a workflow.

```
Item {
  json:    <the domain payload>
  binary?: BinaryAttachment[]   // file bytes, via ctx.binary
  meta?:   <execution metadata>
  paired?: <lineage refs>
}
```

**Hard rule**: `item.json` is the node's output contract — what downstream
nodes consume. Don't wrap input in `{ ...input, result: actual }`. Don't
shove file bytes or base64 into `item.json` — use `ctx.binary.attach` and
attach to `item.binary` instead. Run state persists `json` inline in the
DB and grows with it; binaries are storage-backed blobs referenced by ID.

### Port

Where items enter (`input ports`) or leave (`output ports`) a node. The
default output port is `main`. Conditional/router nodes have multiple
output ports (`true`/`false`, case keys, etc.).

### Activation

When upstream nodes have produced a batch of items destined for a node,
the engine **activates** that node with the batch on its `main` input.
Activations are always batch-shaped, but most nodes are written per-item
(see contract below).

### Engine ↔ Node contract

The engine activates nodes with **batches of items**, but implementations
choose how they iterate:

- **`Node` (batch-shaped)** — receives the whole batch in `execute(items, ctx)`,
  iterates internally. Used when batching semantics matter — e.g. `Split`
  fans one item out to many, `Filter` removes items by predicate, `Aggregate`
  summarizes a whole batch into one output item.
- **`ItemNode` (per-item)** — implements `executeOne(args, ctx)`, the engine
  iterates. `inputSchema` (Zod) validates `item.json` before enqueue;
  `itemExpr` on config fields resolves per-item. This is the common case —
  the great majority of vendor nodes (Gmail, MS Graph, HTTP request, AI
  agent, map data) are per-item.
- **DSL helpers `.map(...)`, `.if(...)`, `.switch({ resolveCaseKey })`** —
  same per-item contract as `ItemNode`, with `(item, ctx)` callbacks.
- **Plugin `defineNode(...)`** — same per-item model with `executeOne`. Use
  `defineBatchNode(...)` only when the node truly needs the whole batch.

### Trigger contract

Triggers emit **one item per external event/record**. If the source API
returned an array of N records, emit N items, not one item with
`json: { results: [...] }`. Downstream code expects the stable shape:
`Items` is the collection, each `item.json` is one domain record.

### Credentials

A typed, pluggable system for authenticated integrations. Each credential
type defines:

- `definition` — what the user fills in (UI schema, with `order`,
  `visibility: default | advanced`, optional `advancedSection`)
- `createSession` — turns stored credential material into a live session
  (typed handle the node receives)
- `test` — verifies the credential works

Nodes that need auth declare their credential type; the host wires up the
session at execution time. The full type is `CredentialType<TPublic,
TMaterial, TSession>`.

### ExecutionContext (`ctx`)

The handle a node receives to interact with the engine. Roughly:

```
ctx.config       — the node's config instance
ctx.credentials  — resolves declared credentials into typed sessions
ctx.data         — read outputs of any completed upstream node
                   (RunDataSnapshot)
ctx.binary       — attach / read binary blobs
ctx.services     — DI container for injected services
ctx.logger       — scoped logger (never console.log in package src)
ctx.http         — HTTP client
```

### Workflow DSL

Fluent builder for composing nodes. Same per-item callback contract as
nodes themselves.

```ts
workflow
  .on(httpTrigger({ path: "/leads" }))
  .map((item, ctx) => ({ email: item.json.email.toLowerCase() }))
  .if(
    (item) => item.json.email.endsWith("@enterprise.com"),
    (branch) => branch.then(slackNotify({ channel: "#sales-vip" })),
    (branch) => branch.then(addToDripCampaign()),
  )
  .then(saveToCRM());
```

`callableTool(...)` (a.k.a. `CallableToolFactory.callableTool(...)`) is
DSL sugar for inline agent tools — same execution contract as other tools,
no implicit merge of `item.json` into tool input.

## Architecture

### Package layout

```
packages/
├── core/                  Engine, execution model, DSL, public contracts.
│                          Pure: no HTTP, no UI, no vendor SDKs, no node
│                          catalog. Adding a node never requires editing
│                          core.
│
├── host/                  Server-side host: Hono gateway, Prisma persistence,
│                          DI container, credential registry, run engine
│                          wiring, auth (Better Auth). Multiple subpath
│                          exports — server-only code stays out of browser
│                          bundles. Single source of truth for /api/auth/*.
│
├── next-host/             Next.js UI shell. React Hook Form + Zod for forms
│                          (via @/components/forms — ESLint blocks raw
│                          <input>/<textarea> outside primitives). Thin
│                          shell; never adds its own auth handlers.
│
├── core-nodes/            Built-in nodes (Split, Filter, Aggregate, Map,
│                          HTTP, AI Agent, etc.).
│
├── core-nodes-gmail/      Vendor plugin: Gmail integration.
├── core-nodes-msgraph/    Vendor plugin: Outlook + OneDrive + Excel.
├── node-example/          Reference plugin for community/extension authors.
│
├── cli/                   @codemation/cli — `codemation` CLI; bin entry
│                          packages/cli/src/bin.ts.
├── create-codemation/     `npm create codemation@latest` scaffolder.
├── eventbus-redis/        Redis-backed event bus implementation.
├── agent-skills/          Reusable skills for AI agent nodes.
└── e2e/                   E2E tooling.

apps/
├── test-dev/              Consumer-style smoke app. Used for local dev
│                          (framework-author mode delegates to it).
├── plugin-dev/            Focused harness for plugin development.
├── e2e/                   E2E harness.
├── docs/                  Documentation site.
└── prove-packaged-auth-fix/  Targeted regression harness.

tooling/
├── vitest/                Shared Vitest configs (unit, integration, ui,
│                          browser, e2e).
├── eslint-config/         Shared ESLint config — enforces DI patterns,
│                          one-class-per-file, no console.log in src,
│                          forbids vi.mock/stubGlobal/stubEnv in tests.
├── tsconfig/              Shared TS configs.
├── release/               Changesets/release tooling.
├── verdaccio/             Local registry smoke tests.
├── scripts/               Internal scripts.
├── codemods/              Migration codemods.
└── test/                  Shared test helpers.
```

### Subpath export discipline

`@codemation/host` deliberately exposes many subpath entries
(`/server`, `/client`, `/persistence`, `/credentials`, `/dto`, `/mapping`,
`/next/server`, `/next/client`, …) so server-only code (Hono, Prisma, full
DI graph) doesn't get pulled into browser bundles. Importing the root
barrel `@codemation/host` is forbidden outside composition-root files —
ESLint and dependency-cruiser enforce this. Phase 1 cleanup of these
boundaries dropped Workflow detail page SSR Turbopack RSS from 5.25 GB
to 2.7 GB. The discipline matters.

Same idea for `@codemation/core` — pick the right subpath, don't dump
everything in the root barrel.

### Auth

`@codemation/host` is the **single auth authority**. Backend owns
`/api/auth/*` (Better Auth). `next-host` is a thin UI shell — never adds
NextAuth/Auth.js handlers. Required env: `AUTH_SECRET`, plus
`BETTER_AUTH_URL` or `CODEMATION_PUBLIC_BASE_URL`.

## Engineering principles

The repo is opinionated. These rules show up in ESLint, in code review,
and in the engine contract:

### Dependency injection by default

Anything that touches the outside world (DB, HTTP, queues, clocks, crypto,
SDKs, FS) is a dependency. **No direct infra imports** in core logic. Use
`tsyringe` with class tokens or stable symbols. Don't hide deps in
constructor defaults; inject them or build in a composition root.

ESLint enforces this under `packages/**/src`:

- No arbitrary `new PascalCase` outside composition-root filenames.
- No `static` methods.
- No exported free functions (with allowlisted name suffixes like
  `Factory`, `Builder`, `Registry`, `Planner`, and `*.types.ts` exceptions).
- One class per implementation file.

If a rule fights you, rename or split the file rather than disabling.

### Plugin packages are exempt from the DI rules

Plugins (`packages/core-nodes-*`) are thin wrappers around vendor SDKs.
They opt out of `single-class-per-file`, `no-manual-di-new`,
`no-static-methods`, and exported-function bans. Prefer **plain modules
of functions, grouped by API surface** (`src/mail/`, `src/drive/`). Use
classes only when state genuinely belongs together. The Gmail package's
DI-heavy style is **not** the template for new plugins. (See user
memory: "Plugin packages should be lightweight, not framework-styled".)

General TS hygiene, logger discipline (no `console.log`), and
`process.env` restrictions still apply.

### Logging

`console.log` is banned under `packages/*/src` (excluding `next-host`
and `cli`, which are UI/user-facing). Inject `LoggerFactory` /
`Logger` and use `info` / `warn` / `error` / `debug`.

Under Vitest, the default minimum log level is `warn` — set
`CODEMATION_LOG_LEVEL=debug|info|warn|error|silent` to override.

### Testing — minimal mocking

The golden rule: **mock as little as possible**. Use mocks only for
truly non-deterministic externals, failure injection, or timing edge
cases. Otherwise prefer interfaces + real implementations + in-memory
variants.

ESLint forbids `vi.mock`, `vi.doMock`, `vi.stubGlobal`,
`vi.unstubAllGlobals`, and `vi.stubEnv` in tests. Save/restore globals
manually in `afterEach` or `try/finally` (UI suite has `isolate: false`
and shares a module graph — clean up after yourself).

For engine tests: **run real nodes**. Define tiny test-only nodes (e.g. a
callback node that records invocations) instead of mocking the engine.
Plugin/package authors can use `WorkflowTestKit` from
`@codemation/core/testing`.

### Test suite split

Five suites, run in parallel from root via `pnpm test`:

- `pnpm run test:unit` — unit suites across all packages
- `pnpm run test:integration` — host + CLI integration tests; brings own
  Postgres, ephemeral ports, unique BullMQ Redis prefix per run
- `pnpm run test:ui` — host UI tests (jsdom, `*.test.tsx`,
  `isolate: false`)
- `pnpm run test:browser` — host browser tests
- `pnpm run test:e2e` — placeholders today

`pnpm run check` is the full CI-equivalent: lint + typecheck + all suites.

### Husky / pre-commit

Pre-commit runs only **lint-staged + changeset:verify + `pnpm run
precommit`** (eslint + typecheck + unit). Integration / UI / browser /
e2e and the full `pnpm lint` (which adds `dupcheck` via jscpd and
`antipatterns` via ast-grep) only run in CI. For substantive changes,
run the closest realistic gate locally before declaring done — usually
`pnpm run lint:eslint && pnpm typecheck && pnpm run test:unit`.

### Versioning

Changesets is **mandatory** for any change to a publishable
`packages/*`. Pre-commit and CI both enforce it. `SKIP_CHANGESET_VERIFY=1`
bypasses locally if needed.

### Prisma — two schemas

Host package keeps **parallel Postgres and SQLite schemas**:

- `packages/host/prisma/schema.postgresql.prisma`
- `packages/host/prisma/schema.sqlite.prisma`
- migrations in `prisma/migrations/` (Postgres) and
  `prisma/migrations.sqlite/` (SQLite)

Any schema change must edit BOTH schemas and add migrations to BOTH
directories with timestamped folder names. Pre-commit doesn't catch
asymmetry today; dev-server boot will fail at runtime against the
missing-migration provider.

## Development modes

Two distinct dev experiences, both first-class:

### Framework-author mode (`pnpm dev`)

For working **on Codemation itself**. Delegates to `@codemation/test-dev`
(`pnpm --filter @codemation/test-dev dev`), source-first, no Turbo
watch-build fanout. Editing core/host/nodes is hot.

### Consumer mode (`pnpm run dev:consumer`)

For working **with Codemation as a consumer** would. Runs `codemation
dev` against `apps/test-dev`, watches consumer files, rebuilds
`.codemation/output`, hot-swaps the consumer manifest. Does not watch
the framework workspace. Same flow a real consumer's project gets.

See [`docs/development-modes.md`](./development-modes.md) for the full
distinction.

## Common commands (from repo root)

```
pnpm dev                    framework-author mode (= test-dev)
pnpm run dev:consumer       consumer mode against apps/test-dev
pnpm codemation <args>      run the CLI from source via tsx
                            (insert -- after `codemation` if your shell
                             swallows args)

pnpm build                  turbo run build
pnpm typecheck
pnpm run lint:eslint        ESLint via turbo
pnpm run lint               ESLint + dupcheck (jscpd) + antipatterns (ast-grep)
pnpm run check              full CI-equivalent: lint + typecheck + all tests

pnpm test                   build + all five test suites in parallel
pnpm run test:unit          unit suite only
pnpm run test:integration   integration suite only
pnpm run test:ui            UI suite only
pnpm run coverage           same suites with v8 lcov, merged

pnpm changeset              add a changeset (required for publishable
                            package changes)

pnpm verdaccio              local registry
pnpm run local-release:publish
pnpm run local-release:smoke
```

Iterating on one package: `pnpm --filter <pkg> test` (or `vitest
path/to/file.test.ts` inside the package). Single test by name:
`vitest -t "test name"`.

## Glossary

- **Activation** — the engine invoking a node with a batch of items.
- **Item** — `{ json, binary?, meta?, paired? }`; one domain record.
- **Per-item node / `ItemNode` / `executeOne`** — node that processes one
  item at a time; engine iterates.
- **Batch node / `Node.execute`** — node that gets the whole batch and
  iterates internally.
- **Port** — input/output channel on a node; default output is `main`.
- **DSL** — fluent builder (`.map`, `.if`, `.switch`, `.then`) for
  composing workflows.
- **Trigger** — node that emits items from an external event source.
- **Credential type** — pluggable authenticated integration definition.
- **Composition root** — the file that wires up DI; the only place where
  arbitrary `new PascalCase` is allowed.
- **Framework-author mode** vs **consumer mode** — the two `pnpm dev`
  flavors.
- **Concierge agent** vs **coding agent** — managed-mode roles
  (multi-tenant chat agent in control plane vs per-installation MCP that
  writes code). See managed-platform-design.md.

## Where to read next

- [`AGENTS.md`](../AGENTS.md) — authoritative architecture rules,
  engine ↔ node contract details, DI standards, ESLint architecture
  rules. Treat as hard requirements.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — branch/PR workflow,
  husky pre-commit, changeset requirements, auth model.
- [`docs/development-modes.md`](./development-modes.md) — framework-author
  vs consumer mode distinction.
- [`packages/core/docs/item-node-execution.md`](../packages/core/docs/item-node-execution.md)
  — per-item execution model deep-dive.
- [`packages/next-host/docs/FORMS.md`](../packages/next-host/docs/FORMS.md)
  — form patterns (RHF + Zod via `@/components/forms`).
- [`docs/managed-platform-design.md`](./managed-platform-design.md) —
  forward-looking design for the managed platform layer.

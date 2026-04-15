## Purpose

This repository is a TypeScript monorepo for a code-first automation framework.
The goal is a pluggable architecture with strict maintainability standards: clean boundaries, dependency injection by default, and testability without heavy mocking.

This document sets the “golden standard” for how we build and review changes in this repo.

**Contribution workflow (branches, PRs, local vs CI checks):** see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Monorepo structure

### Apps

- `apps/test-dev/`
  - Consumer-style example app used for local development and smoke testing.
  - Provides a discovered `codemation.config.ts` plus convention-based `src/workflows` definitions, then starts Codemation with minimal manual wiring.

### Packages

- `packages/core/`
- Engine runtime, execution model, workflow builder DSL, and shared types.
- **Must not** depend on any concrete node implementations.
- `packages/host/`
- Framework-owned host package (UI shell, HTTP/WebSocket gateway, persistence wiring).
- Consumers configure this package; they do not own the UI shell or framework API routes.
- `packages/core-nodes/`
  - Built-in node configs and implementations.
  - Depends on `@codemation/core`.
- `packages/node-*/`
  - Optional / community / extension node packages.
  - These should be addable without touching `packages/core`.

### Tooling

- `tooling/*/`
  - Shared configs and internal tooling packages.

## Architectural rules (hard requirements)

### Boundaries and layering

- **Core must stay pure**:
  - `packages/core` contains the engine and stable contracts only.
  - No HTTP server, no UI, no vendor SDKs, no node “catalog”.
- **Nodes are plugins**:
  - A node package exports config classes + node implementations.
  - Adding a node package should not require editing core code.
- **Apps compose packages**:
  - `apps/test-dev` configures Codemation through discovered bootstrap/workflow conventions and stays thin.
  - Framework-owned UI and host infrastructure live in packages, not consumer apps.

### Public API discipline

- Treat `@codemation/core` exports as a public surface.
- Avoid breaking changes:
  - Prefer additive changes.
  - If a breaking change is necessary, isolate it behind new types and deprecate old ones first.

### Credential types (`@codemation/core`)

- **`CredentialType<TPublic, TMaterial, TSession>`** — full registration: `definition`, `createSession`, and `test` (typed like node `execute` / `config`). Use `satisfies CredentialType<…>` on object literals when defining custom credentials.
- **`CredentialTypeDefinition`** — schema/UI only (what the credentials screen lists); not a session factory. Field entries support **`order`**, **`visibility: "default" | "advanced"`**, and optional **`advancedSection`** on the definition for the collapsible “advanced” block (see [`packages/core/docs/credential-ui-fields.md`](packages/core/docs/credential-ui-fields.md)).
- **`AnyCredentialType`** (`CredentialType<any, any, unknown>`) — type for heterogeneous lists: `CodemationConfig.credentialTypes`, the host registry, and packaged exports like **`openAiApiKeyCredentialType`**. Typed `CredentialType<Specific…>` values assign here without casts.
- Host API: `AppContainerFactory.create`, `CredentialTypeRegistryImpl.getCredentialType`, `OpenAiApiKeyCredentialTypeFactory.createCredentialType`, export **`openAiApiKeyCredentialType`** from `@codemation/host/credentials`.

## Coding standards

### TypeScript

- **Strict typing** is mandatory.
- Prefer explicit types at boundaries:
  - Public function signatures
  - Package exports
  - Node config classes
  - Engine service interfaces
- Avoid `any`. If unavoidable, constrain it locally and explain via naming (e.g. `unsafeX`).

### Code organization

- Keep files small and cohesive.
- Prefer pure functions and deterministic behavior where possible.
- Avoid hidden global state.
- Name things for intent (what/why), not mechanics (how).

### Style

- Favor early returns and clear control flow.
- Avoid over-abstracting; introduce abstractions only when they pay off in tests or reuse.
- Prefer composition over inheritance.

### Forms (`packages/next-host`)

- Use **React Hook Form + Zod** and the barrel **`@/components/forms`** with **`@/components/ui/form`** (not ad-hoc controlled fields). See **`packages/next-host/docs/FORMS.md`**. ESLint blocks raw **`<input>`** / **`<textarea>`** outside **`src/components/ui/**`\*\* (primitives only).

### Logging (server / package `src`)

- **Do not use `console.log`** under `packages/*/src` for core, nodes, queue, eventbus, `node-example`, and `@codemation/host` TypeScript sources (ESLint enforces this). Inject **`LoggerFactory`** / **`Logger`** (`packages/host/src/application/logging/Logger.ts`) and use **`logger.info` / `warn` / `error` / `debug`**; server wiring uses **`ServerLoggerFactory`**.
- **Log noise in tests:** `ServerLogger` / `BrowserLogger` use an injected **`LogLevelPolicy`** (process-wide singleton from **`LogLevelPolicyFactory`** / `logLevelPolicyFactory`): under **Vitest** (`VITEST=true`), the default minimum level is **`warn`**, so routine **`info`/`debug`** lines are suppressed while **`warn`/`error`** still print. Set **`CODEMATION_LOG_LEVEL`** to `debug|info|warn|error|silent` to override (e.g. verbose integration debugging).
- **`ServerHttpErrorResponseFactory`** still uses **`console.error`** for uncaught route failures so real handler bugs stay visible regardless of log level.
- **`packages/next-host`** and **`packages/cli`** are excluded from the `console.log` ESLint rule (UI / user-facing stdout). Client-side logging may use **`BrowserLoggerFactory`** when the app provides it.

## Dependency injection (DI) standards

### Principles

- Treat everything that touches the outside world as a dependency:
  - persistence, queues, clocks, http, crypto, external SDKs, filesystem, etc.
- **No direct imports of infrastructure** inside core logic.
- Nodes should be “DI-friendly”:
  - resolve dependencies via injected services (through `ctx.services` or injected constructor deps).

### Tokens and resolution

- Prefer **class tokens** or stable symbols for resolution.
- Do not rely on runtime string names for correctness.

### Engine ↔ Node contract

- Activations are still **batch-shaped** (`Items` on `main`), but implementations differ:
  - **Batch nodes** (`Node.execute`) receive **`items` as a batch** and iterate internally so each node can control concurrency and batching semantics. Examples in **`@codemation/core-nodes`**: **`Split`** (array or custom fan-out → one item per element), **`Filter`** (predicate), **`Aggregate`** (whole batch → one summarized **`json`** on **`main`**).
- **Per-item nodes** (`ItemNode`, `executeOne`)—for example built-in **`MapDataNode`** and **`AIAgentNode`**—let the engine iterate items. **`inputSchema`** (Zod) validates **`item.json` before enqueue**; optional **`itemValue`** on config fields resolves **per item** before `executeOne` (use **`ctx.data`** like **`RunDataSnapshot`** to read outputs from **any completed** upstream node). **`RunnableNodeConfig`** has **`TInputJson`** (validated input / `executeOne` **`args.input`**), **`TOutputJson`**, and optional **`TWireJson`** for DSL wiring (defaults to **`TInputJson`**). See **`packages/core/docs/item-node-execution.md`**.
- **Fluent DSL callback helpers** follow the same item contract: `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` receive **`(item, ctx)`**, so row data lives under **`item.json`** and prior completed outputs remain available through **`ctx.data`**.
- **Plugin `defineNode(...)`** follows the same per-item model: implement **`executeOne(args, context)`** (**`input`**, **`item`**, **`ctx`**, etc.). Use **`defineBatchNode(...)`** when a helper-defined node still needs legacy **`run(items, …)`** batch semantics. **Config** should hold **static** wiring (credentials, retry policy, presentation); **per-item** behavior and API parameters belong in **inputs** / wire JSON and optional **`itemValue`** on config fields, consistent with built-in nodes. (**`AgentToolFactory.asTool(..., { mapInput })`** is a **separate** tool-input mapper for node-backed tools—not runnable **`itemValue`**.) **`callableTool(...)`** (same as **`CallableToolFactory.callableTool(...)`**) is DSL sugar for inline agent tools: same tool execution contract as other tools, optional **`credentialRequirements`**, no implicit merge of **`item.json`** into tool **`input`**—merge in **`execute`** when required.
- **`execute` must return what the node produces on each output port**, not a generic “input plus a wrapper”:
  - For each emitted `Item`, **`json` is the node’s output payload** for that step—the shape your `RunnableNodeConfig<…, TOutputJson>` (or documented contract) describes as **downstream data**, not the input object with an extra nested bag for “the real result”.
  - **Do not** default to `json: { ...inputJson, result: <actualOutput> }` or similar unless that **nested** shape is intentionally the public API of the node. Prefer `json: <actualOutput>` (and only spread or merge input fields when the node is explicitly an **enrichment** / **field update** step).
  - You may still carry forward **`binary`**, **`meta`**, or **`paired`** from the incoming item when the product needs lineage or attachments; that is separate from over-wrapping **`json`**.
  - **Pass-through** (`return { main: items }`) is correct for routers/merges/no-ops; **replace-the-payload** nodes (HTTP, transforms that emit a new DTO) should match built-ins such as **`HttpRequest`** (“response metadata only—input fields are not passed through” on the output type).
- **Trigger payload shape follows the same rule**:
  - Emit **one workflow `Item` per external event/record** (for example: one email, one webhook request, one queue message).
  - **Do not** pack multiple events into one item as `json: { results: [...] }`, `json: { foundItems: [...] }`, or similar wrapper bags just because the source API returned an array.
  - If the upstream system returns multiple records, map them to **multiple emitted items** so downstream nodes always see the same stable batch shape: `Items` is the collection; each `item.json` is one domain record.

## Testing standards (minimal mocking)

### Golden rule: mock as little as possible

Use mocks only for:

- truly non-deterministic or expensive integrations (third-party APIs),
- failure injection that is otherwise impractical,
- timing edge cases that require deterministic clocks.

Otherwise prefer interfaces + real implementations.

### Vitest ergonomics (ESLint)

In **`**/test/**`** and **`*.test.*`**, ESLint forbids **`vi.mock`**, **`vi.doMock`**, **`vi.stubGlobal`**, **`vi.unstubAllGlobals`**, and **`vi.stubEnv`**. Prefer DI fakes for modules; for globals (e.g. `fetch`), **save the prior value, assign, and restore** in **`afterEach`** or **`try`/`finally`** so **`isolate: false`** UI runs stay stable.

### Use interfaces + in-memory variants

When introducing a new dependency boundary, define an interface and provide:

- a production implementation (later),
- an **in-memory implementation** for tests and local dev.

Examples (future):

- `RunStore` → `InMemoryRunStore`
- `CredentialStore` → `InMemoryCredentialStore`
- `EventBus` → `InMemoryEventBus`

### Engine tests should run “real nodes”

Avoid mocking the engine’s execution path. Instead, define tiny test nodes that execute deterministically.

Recommended pattern: a callback node that records invocations.

```ts
// Example test-only node config + node implementation
import type { Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export class CallbackNodeConfig implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = CallbackNode;
  constructor(
    public readonly name: string,
    public readonly onExecute: (items: Items) => void,
  ) {}
}

export class CallbackNode implements Node<CallbackNodeConfig> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<CallbackNodeConfig>): Promise<NodeOutputs> {
    ctx.config.onExecute(items);
    return { main: items }; // pass-through
  }
}
```

This gives high-signal coverage without fragile mocks.

**Plugin and package authors** can also use **`WorkflowTestKit`** from **`@codemation/core/testing`**: it runs the real engine path (`Engine`, `EngineWorkflowRunnerService`, in-memory stores) with **`run()`** for full workflows and **`runNode()`** for a minimal trigger → node graph. Call **`registerDefinedNodes([...])`** so `defineNode(...)` implementations register on the kit container like **`plugin.register({ registerNode })`** in the host.

## Adding a new node package (community-friendly)

### Requirements

- Create `packages/node-<name>/`
- Depend on `@codemation/core` (and optionally `@codemation/core-nodes` if you reuse shared config helpers).
- Export:
  - config class(es) implementing `NodeConfigBase`
  - node implementation class(es) implementing `Node`/`TriggerNode`

### Checklist

- **No core edits required** to add a node package.
- Node must be deterministic and testable (injected deps; no hidden globals).
- **`execute` returns produced payloads** on each port (`item.json` = output contract), not input wrapped with an extra “result” layer—see **Engine ↔ Node contract** above.
- Provide at least one unit test for the node behavior (prefer in-memory deps).
- For **`defineNode(...)`** plugins, set optional **`icon`** on the definition so the workflow canvas can show a glyph (same string contract as **`NodeConfigBase.icon`**: Lucide `lucide:…`, shipped **`builtin:…`** SVGs, **`si:…`**, or image URLs). Implement **`executeOne`** (not batch **`run`**); use **`defineBatchNode`** only when the node must process the activation batch as a whole.

## `@codemation/host` package exports

The package exposes **multiple subpath entry points** on purpose:

- **Bundle boundaries** — Server-only code (Hono gateway, Prisma, DI container wiring) must not be pulled into browser or edge bundles. Splitting `@codemation/host/server`, `…/next/server`, `…/persistence`, etc. keeps those graphs separate from `…/client` and `…/next/client` (React UI for the Next host).
- **`development` condition** — Resolvers that support it can load TypeScript sources directly during local work; default `import` targets `dist` after `tsdown` (and matches production). TypeScript still maps subpaths to `src` via root `tsconfig` `paths` for editor and `tsx` runs.

Tests use **Vitest** (Vite is the test runner only; there is no Vite-based app). The UI shell is **Next.js** only.

### Test suites (repository root)

From the repo root, suites are grouped for **parallel** runs and a single merged coverage artifact:

| Script                      | Config                                 | Scope                                                                                                                       |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:unit`        | `tooling/vitest/unit.config.ts`        | Core/node packages plus `create-codemation`, `@codemation/cli`, `@codemation/next-host`, and `@codemation/host` unit suites |
| `pnpm run test:integration` | `tooling/vitest/integration.config.ts` | `@codemation/host` HTTP/integration tests and `@codemation/cli` integration tests                                           |
| `pnpm run test:ui`          | `tooling/vitest/ui.config.ts`          | `@codemation/host` `*.test.tsx` (jsdom)                                                                                     |
| `pnpm run test:e2e`         | `tooling/vitest/e2e.config.ts`         | `@codemation/host` e2e placeholders (`passWithNoTests` until cases exist)                                                   |
| `pnpm test`                 | —                                      | `turbo run build` then **all four** suites in parallel (`test:suites`)                                                      |
| `pnpm run coverage`         | —                                      | Runs each suite with **lcov** under `coverage/raw/{unit,integration,ui,e2e}/`, then merges to **`coverage/lcov.info`**      |

Per-package `pnpm test` remains useful for iterating on one package; the canonical full run is **`pnpm test`** from the root.

### Prisma client + Vitest

- Generated Prisma `runtime/*.js` files reference `*.map` files that Prisma does not emit; Vite would otherwise log **ENOENT** on every load. After **`prisma generate`**, run **`pnpm --filter @codemation/host prisma:generate`** (or **`node packages/host/scripts/ensure-prisma-runtime-sourcemaps.mjs`**) so stub maps exist. Host **integration** Vitest config also runs this via **`globalSetup`** before tests.

### Parallel, non-interfering tests

- Tooling Vitest configs use **`maxWorkers: 2`** and **`fileParallelism: true`**. **Integration** (and **unit** / **e2e**) use **`isolate: true`** so parallel files do not share a polluted module graph. **UI** (`*.test.tsx`, jsdom) uses **`isolate: false`** to reuse the module graph—keep tests **clean**: save/restore any overridden globals in **`afterEach`** or **`try`/`finally`**; ESLint forbids **`vi.stubGlobal`**, **`vi.unstubAllGlobals`**, and **`vi.stubEnv`** in tests. Integration harnesses must still bring **their own** Postgres DB (**`PostgresIntegrationDatabase`**), **ephemeral HTTP/WS ports** (**`FrontendHttpIntegrationHarness`**), and **unique external resource keys** (e.g. BullMQ **Redis** queue prefix per run).
- Root **`pnpm test`** / **`pnpm run coverage`** run the four suite processes with **`concurrently -m 2`** so machine load stays bounded while unit + integration + UI + e2e still overlap.

### ESLint architecture rules (`packages/**/src`)

Workspace ESLint enforces DI-friendly patterns: no arbitrary `new PascalCase` outside “composition root” filenames, no `static` methods in the same scope, and no exported free functions—except where the config explicitly ignores `**/index.ts`, `**/*Types.ts`, or `**/*types.ts`. Prefer renaming a module so its basename ends with an allowed suffix from [`tooling/eslint-config/index.mjs`](tooling/eslint-config/index.mjs) (`Factory`, `Builder`, `Registry`, `Planner`, …), or place small contract helpers in a `*.types.ts` file when that matches the module’s role.

## Build & dev conventions

- Monorepo uses **pnpm workspaces** and **Turborepo**.
- Library bundling uses **tsdown**.
- Root **`pnpm dev`** is framework-author mode and delegates to **`pnpm run dev:framework`**. That now delegates directly to **`@codemation/test-dev`** (`pnpm --filter @codemation/test-dev dev`) so framework-author dev stays source-first and avoids Turbo watch-build fanout. **`pnpm run dev:framework:warm`** is kept as a compatibility alias to the same workflow. Next is still started by the CLI, not by Turbo.
- Root **`pnpm run dev:consumer`** is a convenience alias for running **consumer mode** against `apps/test-dev` from the repo root.
- Consumer **`pnpm dev`** is intentionally different: it runs **`codemation dev`**, which starts the Next host from `@codemation/next-host`, watches consumer files, rebuilds `.codemation/output`, and hot-swaps the consumer manifest. It does not watch Codemation workspace packages.
- See **`docs/development-modes.md`** for the distinction between framework-author mode and consumer mode.
- Root **`pnpm codemation …`** runs the CLI from source via `tsx` with `tsconfig.codemation-tsx.json` so decorator-heavy workspace imports work from any cwd. From **`apps/test-dev`**, the same script is available as **`pnpm codemation …`** (consumer root defaults to `.`, so you can omit `--consumer-root`). If your shell or pnpm version swallows arguments, insert `--` after `codemation`.

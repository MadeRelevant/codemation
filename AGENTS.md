## Purpose

This repository is a TypeScript monorepo for a code-first automation framework.
The goal is a pluggable architecture with strict maintainability standards: clean boundaries, dependency injection by default, and testability without heavy mocking.

This document sets the “golden standard” for how we build and review changes in this repo.

## Monorepo structure

### Apps

- `apps/test-dev/`
  - Consumer-style example app used for local development and smoke testing.
  - Provides a discovered `codemation.config.ts` plus convention-based `src/workflows` definitions, then starts Codemation with minimal manual wiring.

### Packages

- `packages/core/`
 - Engine runtime, execution model, workflow builder DSL, and shared types.
 - **Must not** depend on any concrete node implementations.
- `packages/frontend/`
 - Framework-owned frontend and runtime host package.
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

- Nodes receive **`items` as a batch** and must iterate internally:
  - This is required so each node can control concurrency and batching semantics.

## Testing standards (minimal mocking)

### Golden rule: mock as little as possible

Use mocks only for:
- truly non-deterministic or expensive integrations (third-party APIs),
- failure injection that is otherwise impractical,
- timing edge cases that require deterministic clocks.

Otherwise prefer interfaces + real implementations.

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
- Provide at least one unit test for the node behavior (prefer in-memory deps).

## `@codemation/frontend` package exports

The package exposes **multiple subpath entry points** on purpose:

- **Bundle boundaries** — Server-only code (Hono gateway, Prisma, DI container wiring) must not be pulled into browser or edge bundles. Splitting `@codemation/frontend/server`, `…/next/server`, `…/persistence`, etc. keeps those graphs separate from `…/client` and `…/next/client` (React UI for the Next host).
- **`development` condition** — Resolvers that support it can load TypeScript sources directly during local work; default `import` targets `dist` after `tsdown` (and matches production). TypeScript still maps subpaths to `src` via root `tsconfig` `paths` for editor and `tsx` runs.

Tests use **Vitest**, which uses **Vite internally** as the test runner only; there is no Vite-based app or consumer `vite.config` in this repo. The UI shell is **Next.js** only.

### ESLint architecture rules (`packages/**/src`)

Workspace ESLint enforces DI-friendly patterns: no arbitrary `new PascalCase` outside “composition root” filenames, no `static` methods in the same scope, and no exported free functions—except where the config explicitly ignores `**/index.ts`, `**/*Types.ts`, or `**/*types.ts`. Prefer renaming a module so its basename ends with an allowed suffix from [`tooling/eslint-config/index.mjs`](tooling/eslint-config/index.mjs) (`Factory`, `Builder`, `Registry`, `Planner`, …), or place small contract helpers in a `*.types.ts` file when that matches the module’s role.

## Build & dev conventions

- Monorepo uses **pnpm workspaces** and **Turborepo**.
- Library bundling uses **tsdown**.
- Root **`pnpm dev`** is framework-author mode and delegates to **`pnpm run dev:repo`**. It warms the workspace build graph for **`@codemation/test-dev`** and then runs **`turbo run dev --filter=@codemation/test-dev... --filter=!@codemation/next-host --filter=!@codemation/eslint-config`** so the framework packages stay rebuilt automatically while `apps/test-dev` runs **`pnpm exec codemation dev`**. Next is still started by the CLI, not by Turbo.
- Root **`pnpm run dev:consumer`** is a convenience alias for running **consumer mode** against `apps/test-dev` from the repo root.
- Consumer **`pnpm dev`** is intentionally different: it runs **`codemation dev`**, which starts the Next host from `@codemation/next-host`, watches consumer files, rebuilds `.codemation/output`, and hot-swaps the consumer manifest. It does not watch Codemation workspace packages.
- See **`docs/development-modes.md`** for the distinction between framework-author mode and consumer mode.
- Root **`pnpm codemation …`** runs the CLI from source via `tsx` with `tsconfig.codemation-tsx.json` so decorator-heavy workspace imports work from any cwd. From **`apps/test-dev`**, the same script is available as **`pnpm codemation …`** (consumer root defaults to `.`, so you can omit `--consumer-root`). If your shell or pnpm version swallows arguments, insert `--` after `codemation`.


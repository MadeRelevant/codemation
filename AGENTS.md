## Purpose

This repository is a TypeScript monorepo for a code-first automation framework.
The goal is a pluggable architecture with strict maintainability standards: clean boundaries, dependency injection by default, and testability without heavy mocking.

This document sets the “golden standard” for how we build and review changes in this repo.

## Monorepo structure

### Apps

- `apps/test-dev/`
  - Engine host used for local development and smoke testing.
  - Loads workflows (consumer-style), registers node packages, starts the engine host API.
- `apps/frontend/`
  - Next.js (Turbopack) UI that talks to the engine host API.
  - Read-only UX by default (actions like manual run/retry are explicit API calls).

### Packages

- `packages/core/`
  - Engine runtime, execution model, workflow builder DSL, and shared types.
  - **Must not** depend on any concrete node implementations.
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
  - `apps/test-dev` wires everything together (DI container, node packages, workflows, host API).
  - `apps/frontend` only consumes the host API (never imports engine internals).

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

## Build & dev conventions

- Monorepo uses **pnpm workspaces** and **Turborepo**.
- Library bundling uses **tsdown**.
- Root `pnpm dev` should start the engine host and the UI together.


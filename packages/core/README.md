# `@codemation/core`

The **Codemation engine**: workflow types, the execution model, builder DSL, dependency-injection primitives, and shared runtime contracts. It stays free of HTTP servers, databases, UI, and concrete node catalogs so apps and plugins can build on a stable core.

## Install

```bash
pnpm add @codemation/core@^0.0.0
# or
npm install @codemation/core@^0.0.0
```

## When to use

Use this package when you define workflows, implement **custom nodes** (config classes + `Node` implementations), or integrate with the engine in TypeScript. Consumer apps and node packages should depend on `@codemation/core`; they should not pull host or infrastructure code into engine-shaped modules.

## Usage

Main entry:

```ts
import { WorkflowBuilder /* engine types, DI helpers */ } from "@codemation/core";
```

Additional subpaths:

- `@codemation/core/browser` — browser-safe surface where applicable
- `@codemation/core/testing` — test helpers for engine-style code

Build the package (`pnpm --filter @codemation/core build`) so `dist` matches the `exports` map before consuming from published tarballs.

# `@codemation/node-example`

A **minimal example node package**: shows how to ship a custom node (config + implementation) that depends only on `@codemation/core`. The monorepo uses it in tests and as a template for **community or private node packages**.

## Install

```bash
pnpm add @codemation/node-example@^0.0.0
# or
npm install @codemation/node-example@^0.0.0
```

## When to use

Reference or copy this package when you author a new **`node-*`** package. Adding a real node package should not require changes inside `@codemation/core`.

## Usage

```ts
import { ExampleUppercase, ExampleUppercaseNode } from "@codemation/node-example";
```

Inspect `src/` for the uppercase sample node pattern, then replace it with your own `NodeConfigBase` and `Node` classes and export them from your package’s public entry.

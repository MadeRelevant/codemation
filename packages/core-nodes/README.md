# `@codemation/core-nodes`

**Built-in Codemation nodes** shipped with the framework: triggers (for example webhooks), control-flow and data helpers, OpenAI chat model wiring, and related registration types. It depends only on `@codemation/core` plus the small set of libraries those nodes need.

## Install

```bash
pnpm add @codemation/core-nodes@^0.0.0
# or
npm install @codemation/core-nodes@^0.0.0
```

## When to use

Add this package when you want the default node palette in a host or consumer app. Custom or community nodes live in separate packages (see `@codemation/node-example`); they should not require edits to `@codemation/core` to be loaded.

## Usage

```ts
import {} from /* node factories, webhook trigger, OpenAI helpers, etc. */
"@codemation/core-nodes";
```

Wire nodes through your `codemation.config.ts` and workflow definitions per your app’s setup; this README only documents the package boundary.

---
name: codemation-custom-node-development
description: Guides Codemation custom node development with `defineNode(...)` (`execute` per item), `defineBatchNode(...)` (batch `run`), reusable node modules, credential-aware nodes, and the class-based node fallback for advanced cases. Use when creating or updating custom nodes for apps or plugin packages.
compatibility: Designed for Codemation apps and plugin packages that define reusable nodes.
tags: node, custom, plugin
uses: "@codemation/core"
---

# Codemation Custom Node Development

## Mental model

Custom nodes are the extension point for reusable business logic that doesn't belong inline in a workflow callback. `defineNode(...)` wraps a per-item `execute` function with a typed contract (input schema, credential slots, output shape); the engine calls it once per item. `defineBatchNode(...)` is the batch variant for logic that must see all items at once. Nodes compose into workflows via config class instances — the node definition is separate from the config class used to wire it into a workflow.

## Use this skill when

Use this skill for reusable custom node work, whether the node lives inside an app or a published plugin package.

Do not use this skill for pure workflow chaining questions unless the node implementation itself is changing.

## Per-item vs batch

**`defineNode(...)` (per-item)** — the engine calls `execute(args, context)` once per item. This is the right default for the vast majority of nodes: straightforward logic, credential slots, input schema, optional fan-out.

**`defineBatchNode(...)` (batch)** — the engine calls `run(items, context)` with the full activation batch. Use only when the node genuinely needs to see all items at once (aggregation, bulk API calls, cross-item correlation).

When in doubt, start with `defineNode`.

## Node rules

1. Keep nodes deterministic and focused.
2. Request credentials through named slots — never hard-code secrets.
3. Put **static** options (credentials, retry policy, labels) on **config**; put **per-item** behavior in **inputs** / wire JSON and optional `itemExpr` on config fields.
4. **Emit files with `ctx.binary`, not base64 in `json`** — base64 in `item.json` bloats persisted run data. See `references/node-patterns.md`.
5. Drop to class-based node APIs only when you need constructor-injected collaborators, decorators, or deeper runtime metadata.

## Minimal `defineNode` example

```ts
import { defineNode } from "@codemation/core";
import { z } from "zod";

export const uppercaseNode = defineNode({
  key: "example.uppercase",
  title: "Uppercase field",
  icon: "lucide:languages",
  inputSchema: z.object({ field: z.string() }),
  async execute({ input }) {
    return { ...input, field: input.field.toUpperCase() };
  },
});
```

For full patterns — credential-slotted nodes, batch nodes, fan-out, binary payloads, and test kit usage — use your harness's example-discovery tool: `find_examples({ query: "defineNode" })` or `find_examples({ query: "defineBatchNode" })`.

## Read next

- `references/define-node-per-item.md` — full `defineNode(...)` contract, `inputSchema`, `itemExpr`, fan-out, assertion nodes, and `WorkflowTestKit` usage. Load this when writing or debugging a per-item node.
- `references/define-batch-node.md` — `defineBatchNode(...)` contract and when to choose batch over per-item. Load this when the node must see the entire batch at once.
- `references/credential-aware-nodes.md` — credential slots, typed sessions, and how to test credential-aware nodes. Load this when your node needs a credential.
- `references/node-patterns.md` — binary payloads (`ctx.binary`, `attach`, `withAttachment`), fan-out return shapes, polling-trigger binary patterns, MS Graph attachment download, and HTTP binary round-trips. Load this when working with file data or HTTP binaries.

---
name: codemation-custom-node-development
description: Guides Codemation custom node development with `defineNode(...)` (`execute` per item), `defineBatchNode(...)` (batch `run`), reusable node modules, credential-aware nodes, and the class-based node fallback for advanced cases. Use when creating or updating custom nodes for apps or plugin packages.
compatibility: Designed for Codemation apps and plugin packages that define reusable nodes.
---

# Codemation Custom Node Development

## Use this skill when

Use this skill for reusable custom node work, whether the node lives inside an app or a published plugin package.

Do not use this skill for pure workflow chaining questions unless the node implementation itself is changing.

## Default approach

1. Start with `defineNode(...)`.
2. Implement **`execute(args, context)`** — one mapped **input** in, one output payload per item (activations are still batch-shaped; the engine iterates items for you).
3. Give the node a stable key and a clear title.
4. Optionally set **`icon`** on the `defineNode` definition so the workflow canvas shows a proper glyph (same string contract as `NodeConfigBase.icon`).
5. Use **`defineBatchNode(...)`** with **`run(items, context)`** only when the node must process the **entire batch** at once (legacy batch semantics).
6. Promote callback-heavy logic into a node when the graph or tests need a stronger boundary.

## Node rules

1. Prefer helper-based nodes first.
2. Keep nodes deterministic and focused.
3. Request credentials through named slots instead of hard-coded secrets.
4. Put **static** options (credentials, retry policy, labels) on **config**; put **per-item** behavior in **inputs** / wire JSON and optional **`itemExpr`** on config fields (consistent with built-in nodes).
5. Drop to class-based node APIs only when you need constructor-injected collaborators, decorators, or deeper runtime metadata.

## Testing with `WorkflowTestKit`

For engine-backed tests without the host, use **`WorkflowTestKit`** from **`@codemation/core/testing`**: **`registerDefinedNodes([...])`**, then **`runNode`** or **`run`**. See the plugin development doc and `@codemation/core` tests for examples.

## Read next when needed

- Read `references/node-patterns.md` for `defineNode(...)` patterns and packaging guidance.

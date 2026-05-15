# Define Batch Node

Load this when you need to author a `defineBatchNode(...)` node that processes all items in one call.

## When to use `defineBatchNode` instead of `defineNode`

- The node must see the **entire activation batch** at once (e.g. an aggregation, a bulk API call, or a node that correlates items against each other).
- Legacy batch semantics are required by the calling workflow.
- You need the same contract as built-in batch-shaped nodes such as `Aggregate`.

For the common case (one-item-at-a-time logic), prefer `defineNode` — the engine handles iteration for you.

## Minimal skeleton

```ts
import { defineBatchNode } from "@codemation/core";
import { z } from "zod";

export const sumNode = defineBatchNode({
  key: "example.sum",
  title: "Sum numeric field",
  inputSchema: z.object({ value: z.number() }),
  async run(items, { config }) {
    const total = items.reduce((acc, item) => acc + (item.json as { value: number }).value, 0);
    return [{ json: { total } }];
  },
});
```

## Contract

- `run(items, context)` receives the **full array** of activation items.
- Return an array of output items (same length as input is not required — you can fan-in to one, or fan-out to many).
- The context object exposes `config`, `credentials`, and `execution` (same as `defineNode`).

## Advanced fallback

Reach for class-based node APIs when constructor-injected collaborators are required, plugin packaging needs the lower-level runtime contract, or decorators/persisted metadata need tighter control.

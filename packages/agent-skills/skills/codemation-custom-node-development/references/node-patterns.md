# Node Patterns

## Start here

Use `defineNode(...)` when:

- the node logic is straightforward
- the node belongs to one app or plugin package
- helper-based credential slots are enough

## Standard helper shape (`executeOne`)

```ts
export const uppercaseNode = defineNode({
  key: "example.uppercase",
  title: "Uppercase field",
  icon: "lucide:languages",
  input: {
    field: "string",
  },
  executeOne({ input }, { config }) {
    return {
      ...input,
      [config.field]: String(input[config.field as keyof typeof input] ?? "").toUpperCase(),
    };
  },
});
```

Optional **`icon`** is forwarded to the generated node config for the canvas (Lucide `lucide:…`, **`builtin:…`** / **`si:…`**, or image URLs). See `packages/core-nodes/src/canvasIconName.ts` and the Next host `WorkflowCanvasNodeIcon` resolver.

## Batch helper shape (`defineBatchNode`)

When the node must see **all items in one call**, use **`defineBatchNode`** and **`run(items, { config, credentials, execution })`** returning **`Items`** per port (same as class-based **`Node.execute`**).

## When a custom node pays off

Move from an inline callback to a custom node when:

- the workflow graph needs a clear reusable step
- the logic is shared across workflows
- tests need a stable module boundary
- credential or dependency boundaries should be explicit

## Advanced fallback

Reach for class-based node APIs when:

- constructor-injected collaborators are required
- plugin packaging needs the lower-level runtime contract
- decorators or persisted metadata need tighter control

## Runtime reminder

- **`defineNode`** runs **`executeOne` once per item** (with optional **`mapInput`** / **`inputSchema`** before enqueue)
- **`defineBatchNode`** runs **`run`** once per activation batch
- keep nodes deterministic and testable; prefer real code paths or in-memory collaborators over heavy mocking

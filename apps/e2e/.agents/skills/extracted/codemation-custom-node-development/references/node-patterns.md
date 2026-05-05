# Node Patterns

## Start here

Use `defineNode(...)` when:

- the node logic is straightforward
- the node belongs to one app or plugin package
- helper-based credential slots are enough

## Standard helper shape (`execute`)

```ts
export const uppercaseNode = defineNode({
  key: "example.uppercase",
  title: "Uppercase field",
  icon: "lucide:languages",
  input: {
    field: "string",
  },
  execute({ input }, { config }) {
    return {
      ...input,
      [config.field]: String(input[config.field as keyof typeof input] ?? "").toUpperCase(),
    };
  },
});
```

Optional **`icon`** is forwarded to the generated node config for the canvas (Lucide `lucide:…`, **`builtin:…`** / **`si:…`**, or image URLs). See `packages/core-nodes/src/canvasIconName.ts` and the Next host `WorkflowCanvasNodeIcon` resolver.

## Batch helper shape (`defineBatchNode`)

When the node must see **all items in one call**, use **`defineBatchNode`** and **`run(items, { config, credentials, execution })`** returning outputs for the batch (same contract as other batch-shaped nodes such as **Aggregate**).

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

- **`defineNode`** runs **`execute` once per item** (with optional **`inputSchema`** and **`itemExpr`** on config fields before **`execute`**)
- **`defineBatchNode`** runs **`run`** once per activation batch
- keep nodes deterministic and testable; prefer real code paths or in-memory collaborators over heavy mocking

## Emitting items, fan-out, and binaries (for AI codegen)

**Return shapes**

- Return **plain JSON** → one output item with that **`json`** (unless the value is a **top-level array**, which **fans out** to one item per element).
- Return **`emitPorts({ portName: [...] })`** for multi-port routing.
- Return an **item-shaped** `{ json, binary?, meta?, paired? }` when you need explicit **`binary`** / **`meta`** / **`paired`** control.

**Never put bulk file content in `item.json`**

- Fields like `contentBase64`, `data`, or multi-megabyte strings are stored **inside persisted run / step JSON** in the database. That **scales poorly** (base64 is larger than raw bytes) and hurts snapshots and tooling.
- **Correct:** `const attachment = await args.ctx.binary.attach({ name: "file", body: bytesOrStream, mimeType, filename })` then `return args.ctx.binary.withAttachment({ json: { ok: true } }, "file", attachment)` (or build `{ json, binary }` by hand).
- **`body`** types match **`BinaryBody`**: `Uint8Array`, `ArrayBuffer`, `ReadableStream`, or async iterable of chunks (same idea as **`HttpRequest`** downloading a body).
- **`keepBinaries: true`** only **preserves existing** **`item.binary`** through a plain JSON return; it does **not** convert base64 strings in **`json`** into attachments.

**Triggers**

- Emit **one `Item` per external record**; use **`item.binary`** per record for files—not one item whose **`json`** contains an array of embedded files.

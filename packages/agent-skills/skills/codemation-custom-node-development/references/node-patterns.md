# Node Patterns

Load this when working with file data, binary payloads, HTTP binaries, MS Graph attachments, or when you need reference on fan-out return shapes and polling-trigger binary patterns.

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
- For polling triggers that fetch records carrying file payloads (mail attachments, message media, etc.), do this in two phases:
  1. In `runCycle` (the polling step), fetch only the **metadata** (id, name, contentType, size). The result is persisted into the trigger's setup state and into emitted item JSON, so it must stay small.
  2. In `execute(items, ctx)`, when the cfg opts into downloads, fetch each blob's bytes from the source API and register them via `ctx.binary.attach(...)`. Then return items via `ctx.binary.withAttachment(item, slot, stored)`.
- **Do not** request the full payload in the polling fetch (e.g. Microsoft Graph `$expand=attachments` returns base64 `contentBytes` inline; use `$expand=attachments($select=id,name,contentType,size)` to keep the response light). Large polling responses bloat the run state on every cycle, even when no item is emitted.

## Binary payloads in sub-workflow chains

Binary slots attached inside a node survive SubWorkflow boundaries with no extra work. The shared `BinaryStorage` DI singleton means `ctx.binary.openReadStream` works regardless of which run originally stored the bytes.

### Pattern: attach in a node, read in the parent after SubWorkflow

```ts
// Child node — attaches a slot and returns the modified item.
export const parseAndStoreNode = defineNode({
  key: "example.parse-store",
  title: "Parse and Store",
  inputSchema: z.object({ filename: z.string() }),
  async execute({ input, item }, { binary }) {
    const bytes = Buffer.from("...parsed content...");
    const att = await binary.attach({
      name: "parsed",
      body: bytes,
      mimeType: "text/plain",
      filename: `${input.filename}.txt`,
    });
    return binary.withAttachment(item, "parsed", att);
  },
});
```

After `SubWorkflowNode` returns, the parent's continuation nodes see `item.binary["parsed"]` and can call `ctx.binary.openReadStream(item.binary["parsed"])` to read the bytes.

### Testing binary across SubWorkflow with `WorkflowTestKit`

```ts
import { DefaultExecutionContextFactory, InMemoryBinaryStorage } from "@codemation/core";
import { createEngineTestKit } from "@codemation/core/testing";
import { ItemHarnessNodeConfig } from "@codemation/core/testing";

const storage = new InMemoryBinaryStorage();
const kit = createEngineTestKit({
  executionContextFactory: new DefaultExecutionContextFactory(storage),
});

// Use ItemHarnessNodeConfig (NOT CallbackNodeConfig) for nodes that must modify items:
const attachNode = new ItemHarnessNodeConfig(
  "Attach",
  z.unknown(),
  async ({ item, ctx }) => {
    const att = await ctx.binary.attach({
      name: "doc",
      body: Buffer.from("content"),
      mimeType: "application/pdf",
      filename: "doc.pdf",
    });
    return ctx.binary.withAttachment(item as Item, "doc", att);
  },
  { id: "attach" },
);
// CallbackNodeConfig is fine for assertion-only (observe) nodes — it echoes input unchanged.
```

Important: `CallbackNodeConfig` discards its callback return value and always echoes input items. Never use it for nodes that must attach binary or transform items.

## MS Graph: selective attachment download

Use `OutlookAttachmentDownload` from `@codemation/core-nodes-msgraph` when you have already obtained attachment metadata (filename, contentType, id) and want to download only specific attachments.

```ts
import { onNewMsGraphMailTrigger, outlookAttachmentDownloadNode } from "@codemation/core-nodes-msgraph";

workflow("wf.download-resumes")
  .trigger(onNewMsGraphMailTrigger, { mailbox: "me", folderId: "inbox" })
  .then(
    outlookAttachmentDownloadNode.create(
      {
        messageId: "", // falls back to item.json when empty
        attachmentId: "", // falls back to item.json when empty
        binarySlot: "resume",
        sizeCapBytes: 10 * 1024 * 1024,
      },
      "DownloadResume",
    ),
  )
  .build();
```

Key constraints:

- Only `#microsoft.graph.fileAttachment` is supported — `itemAttachment` / `referenceAttachment` throw immediately.
- Set `keepBinaries: true` on any downstream node that needs to pass the binary slot forward.
- The credential is `msGraphMailOAuthCredentialType`; `Mail.Read` scope is sufficient.

## HTTP + binary: download to a slot, then upload from a slot

`HttpRequest` (from `@codemation/core-nodes`) natively handles binary response and request bodies.

### Download a file to a binary slot

```ts
import { HttpRequest } from "@codemation/core-nodes";
import { workflow } from "@codemation/host";

export default workflow("wf.download-pdf")
  .manualTrigger<{ url: string }>("Start", { url: "" })
  .then(
    new HttpRequest("DownloadResume", {
      responseFormat: "binary",
      responseBinarySlot: "resume", // default is "response"
      responseSizeCapBytes: 10 * 1024 * 1024, // 10 MiB cap (default 100 MiB)
    }),
  )
  .build();
// item.json gets: { status, headers, binarySlot, contentType, size, filename? }
// item.binary["resume"] holds the BinaryAttachment reference — never base64.
```

### Upload binary bytes from a slot

```ts
new HttpRequest("UploadResume", {
  method: "POST",
  url: "https://api.example.com/files",
  body: { kind: "binary", slot: "resume" },
  // Content-Type defaults to the attachment's mimeType.
});
```

### Download then upload (full round-trip)

```ts
export default workflow("wf.mirror-pdf")
  .manualTrigger<{ sourceUrl: string; targetUrl: string }>("Start", { sourceUrl: "", targetUrl: "" })
  .then(new HttpRequest("Download", { urlField: "sourceUrl", responseFormat: "binary", responseBinarySlot: "file" }))
  .then(new HttpRequest("Upload", { urlField: "targetUrl", method: "PUT", body: { kind: "binary", slot: "file" } }))
  .build();
```

Key rules:

- Never put bytes or base64 in `item.json` — always use `ctx.binary`.
- `responseSizeCapBytes` is checked against `Content-Length` before reading the body; set it for untrusted sources.
- Use `keepBinaries: true` on downstream nodes that must forward the slot.

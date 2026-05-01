# Runnable execution (canonical docs)

**End-user documentation** for the unified runnable contract (per-item `execute`, wire vs parsed input, ports, merge-by-origin, empty-batch behavior, **emitting items and binaries**) lives in the docs app:

- [`docs/content/concepts/execution.mdx`](../../docs/content/concepts/execution.mdx) (published under **Concepts → Execution model**).
- [`docs/content/workflows/custom-nodes.mdx`](../../docs/content/workflows/custom-nodes.mdx) — **custom node return shapes**, **`ctx.binary.attach`**, why **not** to use base64 in **`item.json`**.

This file is retained as a pointer so older links keep resolving; detailed semantics should be edited in `docs/content` to avoid drift.

## Quick reference (engine)

- Activations are still **batch-shaped** (`Items` on `main`); runnables use **`RunnableNode.execute(args)`** per item.
- **`inputSchema.parse(item.json)`** feeds **`args.input`**; **`item.json`** is not rewritten by the engine.
- **`itemExpr`** on config is resolved per item before `execute` (see `ItemExprResolver`).

## Quick reference (emitting items and binaries)

- **One row per item:** Returning a **top-level JSON array** from **`execute`** = **fan-out** (one output item per element). Prefer **many items** over `json: { items: [...] }` when the array is “multiple records”.
- **Never park bulk file bytes in `item.json`:** Base64 or huge strings are persisted **inline** in run/step JSON → **database bloat** (~4/3 size for base64) and heavier snapshots. **AI agents and codegen should default to binary attachments.**
- **Use `ctx.binary`:** `NodeExecutionContext.binary` exposes **`attach({ name, body, mimeType, filename? })`** and **`withAttachment(item, name, attachment)`**. **`body`**: `Uint8Array` | `ArrayBuffer` | `ReadableStream` | async iterable (see **`BinaryBody`** in `runtimeTypes.ts`). Same pattern as **`HttpRequestNode`** for downloads.
- **`defineNode`:** Use **`args.ctx.binary`** (or **`context.execution.binary`**) inside **`execute`**; return an **item-shaped** `{ json, binary }` when you need explicit control, or **`withAttachment`** on a fresh item.
- **Preserve inbound files:** **`keepBinaries: true`** on **`defineNode`** / **`MapData`** copies existing **`item.binary`** through **plain JSON returns**; it does **not** turn base64 strings in **`json`** into storage-backed binaries.

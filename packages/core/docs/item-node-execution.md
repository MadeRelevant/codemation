# Runnable execution (canonical docs)

**End-user documentation** for the unified runnable contract (per-item `execute`, wire vs parsed input, ports, merge-by-origin, and empty-batch behavior) lives in the docs app:

- [`docs/content/concepts/execution.mdx`](../../docs/content/concepts/execution.mdx) (published under **Concepts → Execution model**).

This file is retained as a pointer so older links keep resolving; detailed semantics should be edited in `docs/content` to avoid drift.

## Quick reference (engine)

- Activations are still **batch-shaped** (`Items` on `main`); runnables use **`RunnableNode.execute(args)`** per item.
- **`inputSchema.parse(item.json)`** feeds **`args.input`**; **`item.json`** is not rewritten by the engine.
- **`itemExpr`** on config is resolved per item before `execute` (see `ItemExprResolver`).

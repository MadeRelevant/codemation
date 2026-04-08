---
"@codemation/core": minor
"@codemation/agent-skills": patch
"create-codemation": patch
---

**Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`executeOne(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require legacy batch **`Node.execute`** semantics.

Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

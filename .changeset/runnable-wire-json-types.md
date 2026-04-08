---
"@codemation/core": patch
"@codemation/core-nodes": patch
---

Add `TWireJson` to `RunnableNodeConfig`, typed `ItemInputMapper<TWire, TIn>` (bivariant for storage), `RunnableNodeWireJson` helper, and align `ChainCursor` / workflow DSL with upstream wire typing. Introduce `ItemInputMapperContext` so `mapInput` receives typed `ctx.data` (`RunDataSnapshot`) for reading any completed upstream node’s outputs.

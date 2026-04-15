---
"@codemation/core": minor
---

Add typed workflow authoring helpers for reusable node params and run-data reads.

- export `Expr`, `Param`, and `ParamDeep` so helper-defined node params can accept literals or `itemExpr(...)`
- export `nodeRef<TJson>()` plus generic `RunDataSnapshot` item accessors for typed `ctx.data` reads
- keep helper-node runtime config resolved while expanding the public authoring surface for expression-style params

---
"@codemation/core-nodes": minor
---

Improve workflow DSL typing for helper-defined nodes.

- allow `.node(...)` and branch `.node(...)` calls to accept helper-node params that use `itemExpr(...)`
- preserve type safety when the current workflow item is a superset of the helper node's declared input shape
- remove the need for common casts around empty-config helper nodes

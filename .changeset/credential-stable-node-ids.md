---
"@codemation/core": major
---

**Breaking change:** Default node ids in `WorkflowBuilder` now derive from a slug of the node's label (`config.name`) instead of a sequential counter (`${tokenName}:${seq}`).

Previously, adding or reordering nodes changed their auto-assigned ids, silently orphaning credential bindings stored in the database (keyed by `workflowId + nodeId + slotKey`). The new scheme makes ids stable across reorders and inserts.

**Migration required:** Any existing credential bindings keyed by the old `${tokenName}:${seq}` format will appear unbound after this change. Users must re-bind credentials manually in the workflow editor. To avoid disruption, add an explicit `id:` field to node configs before upgrading — explicit ids are unaffected by this change and take priority over the label slug.

**Validation added:** `WorkflowBuilder.build()` now throws `WorkflowDefinitionError` if any node has an empty effective id (blank label + no explicit id) or if two nodes share the same effective id. Fix: provide a unique `id:` on the offending node configs.

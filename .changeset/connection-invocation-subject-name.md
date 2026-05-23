---
"@codemation/core": minor
"@codemation/canvas-core": patch
"@codemation/host": patch
---

Add optional `subjectName?: string` to `ConnectionInvocationRecord` and `ConnectionInvocationAppendArgs` — a stable identifier for the thing an invocation acts on that persists across status transitions. The MCP integration's `wrapToolExecutes` sets it to the tool name on every transition (running / completed / failed), so the inspector's tool-call timeline entries can render `"Tool call · <toolName>"` for MCP servers (which expose many tools through a single connection node) instead of an opaque `"Tool call"`.

For node-backed agent tools, the parent connection node id already encodes the tool name — `subjectName` stays unset there and the inspector renders the existing `"Tool call"` title unchanged.

`statusLabel` (the running-only sentence rendered on the canvas card sub-line) is unchanged; `subjectName` is the persistent structural sibling used by the inspector.

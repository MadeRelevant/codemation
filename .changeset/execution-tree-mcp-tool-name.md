---
"@codemation/canvas-core": patch
---

Execution-inspector tree rows for MCP tool invocations now show the actual tool name (e.g. `search_threads`, `send_email`) as the primary label instead of repeating the MCP server's display name for every child row. Pulled from the `subjectName` field on `ConnectionInvocationRecord` (already populated by `AgentMcpIntegrationImpl.wrapToolExecutes`), so no other layer changes are required.

LLM connection nodes and node-backed agent tools are unaffected — they leave `subjectName` unset and the row inherits the base connection node name as before.

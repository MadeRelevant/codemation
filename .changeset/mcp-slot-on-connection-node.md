---
"@codemation/core": patch
"@codemation/host": patch
"@codemation/core-nodes-gmail": patch
---

MCP credential slots now live on the MCP connection node, matching ChatModel and Tool
connection nodes. Each declared `mcpServers` entry materializes an MCP connection node
and the credential slot is attached to that node with slot key `"credential"` (label
and accepted types derived from the MCP catalog declaration). The standard credential
slot traversal picks them up via `AgentConnectionNodeCollector` — no special-case path.

Removed the agent-owned `mcp:<serverId>` slot key. Removed the `mcpSlotKey(serverId)`
helper from `@codemation/core` (and its re-export from the type-only `contracts`
subpath). At runtime, `AgentMcpIntegration.prepareMcpTools` now resolves the binding at
`(workflowId, ConnectionNodeIdFactory.mcpConnectionNodeId(agentNodeId, serverId), "credential")`.

Gmail MCP `requiredScopes` trimmed to `["https://www.googleapis.com/auth/gmail.modify"]`
— `gmail.modify` is a superset of `gmail.readonly` + `gmail.send` for messages, threads,
drafts, and labels, so the previous list was redundant.

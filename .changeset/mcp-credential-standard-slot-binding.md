---
"@codemation/core": minor
"@codemation/core-nodes": minor
"@codemation/host": minor
"@codemation/canvas-core": patch
---

Remove the MCP credential bypass on AI agents. `AIAgent.mcpServers` is now a plain
`ReadonlyArray<string>` of server ids — the inline `{ credential }` field is gone. Each
declared server surfaces a standard credential slot on the agent node (key
`mcp:<serverId>`, label and accepted types from the MCP catalog) and binds through the
same `CredentialBinding` table as every other slot. At execute time the host resolves the
binding via `getBinding({ workflowId, agentNodeId, slotKey: mcp:<serverId> })`, then opens
the MCP pool with the resolved credential instance — no more reading the credential id
out of the workflow config.

Breaking — config shape change. Replace:

```ts
mcpServers: { gmail: { credential: "<instanceId>" } }
```

with:

```ts
mcpServers: ["gmail"]
```

Then bind the credential through the canvas credential dropdown before activating the
workflow, the same way trigger credentials are bound. The `McpServerBindings` /
`McpServerExplicitBinding` types are removed from `@codemation/core`;
`AgentMcpIntegration.prepareMcpTools` now takes `{ workflowId, agentNodeId, serverIds }`.

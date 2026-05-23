---
"@codemation/core": minor
"@codemation/core-nodes": minor
---

MCP servers are now first-class agent connection slots with credential pickers.

`AgentConnectionNodeCollector.collect()` accepts an optional `mcpServerResolver` callback (Pattern A). When provided, each entry in `agentConfig.mcpServers` is resolved and emitted as a `"tools"` connection slot descriptor — identical pattern to tools. Each MCP slot gets a stable node id via `ConnectionNodeIdFactory.mcpConnectionNodeId()` and exposes `getCredentialRequirements()` from the resolved `McpServerDeclaration`.

`AIAgentConnectionWorkflowExpander` accepts the resolver in its constructor; `AppContainerFactory` wires `McpServerCatalog.get` there. MCP credential pickers are now visible on the canvas alongside tool slots.

Removes the `AIAgent.inspectorSummary()` band-aid that listed MCP server ids as plain text — those are now first-class connection nodes rendered on the canvas directly.

---
"@codemation/core": minor
"@codemation/core-nodes": minor
"@codemation/host": minor
---

feat(story-11): Wire MCP catalog into agent — explicit and shorthand binding, scope validation, pool integration, telemetry, and runtime 403 detection

- `@codemation/core`: `AgentMcpIntegration` interface + token, `McpServerBindings` types, `NeedsReconsentEvent`, `AgentBindError`, `NoOpAgentMcpIntegration` fallback, `CodemationTelemetryAttributeNames.mcpServerId/mcpToolName`
- `@codemation/core-nodes`: `AIAgentConfig` + `AIAgent` extended with `mcpServers` and `pinnedMcpTools`; `DeferredMetaToolStrategy.ownsToolName` covers MCP tools; `AIAgentNode` injects `AgentMcpIntegration` and strips AI SDK auto-execute from strategy tools
- `@codemation/host`: `AgentMcpIntegrationImpl` — resolves bindings, validates scopes, opens pool, wraps tool execute with telemetry spans and 403/permission error detection

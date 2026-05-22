---
"@codemation/core": minor
"@codemation/host": minor
---

Remove deprecated broker-era MCP fields: `NeedsReconsentEvent.oauthAppKey`, shorthand `McpServerBindings` string array form, and `AgentMcpIntegrationImpl.autoResolveCredential`. Explicit binding (`{ serverId: { credential: "<instanceId>" } }`) is now the only supported form — eliminating ambiguity when multiple credential instances of the same type exist.

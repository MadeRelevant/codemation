---
"@codemation/host": patch
---

fix(credentials): MCP server credential slots now appear in the properties panel

`WorkflowCredentialNodeResolver` was calling `AgentConnectionNodeCollector.collect()` without the `mcpServerResolver` argument in both `addRecursiveAgentSlots` and `findRecursiveConnectionNode`, so MCP attachment nodes (e.g. Gmail) were never included in the credential slot list. The early-return guard in `findRecursiveConnectionNode` also rejected MCP node IDs because it only checked for LLM and tool connection node ID patterns. Injecting `McpServerCatalog` into the resolver and passing it as the resolver to all three `collect()` call sites fixes both paths.

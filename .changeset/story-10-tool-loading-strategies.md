---
"@codemation/core-nodes": minor
---

feat(agent): tool-loading strategies with BM25 deferred meta-tool (Story 10)

Introduces ToolLoadingStrategy interface and DeferredMetaToolStrategy implementation.
The strategy BM25-indexes MCP server tools at agent-bind time and exposes a find_tools
meta-tool to the model, deferring the full tool list injection to on-demand discovery.
AIAgentNode is refactored to use the strategy per turn; existing behaviour is unchanged
when no MCP servers are connected.

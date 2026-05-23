---
"@codemation/canvas": patch
"@codemation/canvas-core": patch
"@codemation/core": patch
"@codemation/host": patch
---

Fix workflow detail screen hydration mismatch caused by overlay siblings (tabs, run button, error banner, realtime badge) being rendered conditionally on controller state that diverges between SSR and a warm React Query client cache. Overlay siblings are now gated behind the same `hasMounted` flag as the canvas root.

Render AIAgent MCP-server attachments in the canvas. `WorkflowDefinitionMapper` (the server-side mapper that feeds `/api/workflows/:id`) now passes an `McpServerResolver` backed by the host's `McpServerCatalog` to `AgentConnectionNodeCollector.collect`, so virtual connection nodes for declared `mcpServers` are emitted alongside the LLM and tool children. The MCP descriptor itself carries `icon: "lucide:plug"` and `lucide:plug` is added to the curated `WorkflowCanvasLucideIconRegistry` so MCP servers render with a distinct icon on the synchronous zero-HTTP path.

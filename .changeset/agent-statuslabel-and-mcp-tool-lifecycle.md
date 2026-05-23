---
"@codemation/core": minor
"@codemation/core-nodes": patch
"@codemation/host": patch
"@codemation/canvas-core": patch
"@codemation/canvas": patch
---

Add a `statusLabel` field to `ConnectionInvocationRecord` / `ConnectionInvocationAppendArgs` so connection invocations can carry a short human-readable description of what they are doing (e.g. `"calling search_messages"`). The engine-side `NodeRunStateWriter` persists it; the canvas-side mirror picks it up via the standard patch projection.

Wire per-MCP-tool-call lifecycle invocations through `AgentMcpIntegration`. `prepareMcpTools` now accepts an optional `appendMcpInvocation` callback (plus the agent activation / iteration / item / parent-invocation context). When the host-side `AgentMcpIntegrationImpl` wraps a tool's `execute`, it emits a `running` record with `statusLabel: "calling <toolName>"` and a matching `completed` or `failed` record; the existing telemetry span and 403 `NeedsReconsentEvent` paths are preserved. `@codemation/canvas-core` exposes a `CurrentStatusLabelSelector` and `WorkflowCanvasNodeData.currentStatusLabel`; `@codemation/canvas` renders the latest non-empty label as a sub-line under the node card. The two capabilities work together: MCP tool calls under an agent now stream the same invocation events the LLM and node-backed tool paths already emit, and the canvas surfaces the running label per-node.

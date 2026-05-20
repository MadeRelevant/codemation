---
"@codemation/core-nodes": patch
---

Surface configured MCP servers in agent inspector summary. AIAgent.inspectorSummary() now emits a "MCP servers" row listing bound server IDs (shorthand array or explicit record keys), visible in the node properties slide panel at design time.

Note: per-MCP credential picker (slot-level credential binding UI) is deferred — AIAgent does not currently emit per-MCP credential requirements; explicit bindings are encoded in workflow source and shorthand bindings auto-resolve at runtime. Full picker support requires new core contracts.

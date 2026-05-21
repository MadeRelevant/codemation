---
"@codemation/canvas": patch
"@codemation/canvas-core": patch
---

Fix workflow detail screen hydration mismatch caused by overlay siblings (tabs, run button, error banner, realtime badge) being rendered conditionally on controller state that diverges between SSR and a warm React Query client cache. Overlay siblings are now gated behind the same `hasMounted` flag as the canvas root.

Give MCP server attachment nodes a distinct `lucide:plug` icon so they are visually distinguishable from generic tool children on the canvas. Adds `plug` to the curated `WorkflowCanvasLucideIconRegistry` so it resolves on the synchronous zero-HTTP path.

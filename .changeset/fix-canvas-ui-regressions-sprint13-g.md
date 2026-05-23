---
"@codemation/canvas": patch
"@codemation/canvas-core": patch
---

Fix three browser-visible regressions on the workflow detail / canvas screen (Sprint 13 Story G).

**Bug 1 — Hydration mismatch on canvas mount:** `WorkflowDetailScreen` now gates canvas rendering behind a `hasMounted` effect so the server and first client render both produce the loading placeholder. Previously a warm React Query cache could cause the client to render `WorkflowCanvas` while the server rendered `DefaultLoadingState`, producing a React hydration error.

**Bug 2 — clock.svg 404:** `WorkflowCanvasLucideIconRegistry` now includes the `Clock` icon from `lucide-react`. Previously `CronTrigger`'s `lucide:clock` icon fell through to the remote-glyph path, which issued a redundant HTTP request to `/api/lucide-icon/clock.svg` (the route works, but the curated registry is the zero-HTTP fast path).

**Bug 3 — MCP attachment node invisible/unselectable:** `PersistedWorkflowSnapshotMapper.toTopLevelNodes` no longer early-returns when all connection-slot children are already materialized. The previous early return skipped `toAttachmentNodes()` — the only code path that emits MCP attachment nodes — because `allConnectionChildrenMaterialized` only examined `snapshot.connections` (tool/LLM wiring), not `config.mcpServers`. MCP nodes are now always emitted and are visible and clickable on the canvas.

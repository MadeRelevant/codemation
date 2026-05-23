---
"@codemation/canvas-core": patch
---

test(canvas-core): cover inspect/run/pin controllers (Sprint 14 coverage)

Extends behavior test suites for the three canvas-core workflow detail controllers,
bringing each above the 90% per-file coverage threshold:

- `useWorkflowInspectController`: 92%→96% stmts / 89%→95% funcs. New tests cover
  stale properties-panel eviction on workflow structure change, selectedCanvasNodeId
  eviction, port selection find callbacks, focusedInvocationIdInPropertiesPanel
  matching, and the error-appears-on-same-selection mode auto-switch (ref-based branch).

- `useWorkflowPinController`: 86%→98% stmts / 85%→100% funcs. New tests cover
  edge-contributed output ports (filter/map callbacks), non-main port alphabetic sort
  (localeCompare branch), preferredPort-in-fallback-list return, hasNodeErrorHandler
  with declared ports, and the no-declared-ports error-handler fallback.

- `useWorkflowRunController`: 77%→91% stmts / 74%→94% funcs. New tests cover
  replaceDebuggerOverlay success + error paths, copySelectedRunToLive success + error
  - no-op when no run, persistWorkflowSnapshotUpdate success + error swallow, stale
    selectedRunId eviction, in-flight double-run guard, pinnedNodeIds filter callback,
    pendingSelectedRun prepend path, workflow-structure-change reset effect, and
    setWorkflowActive onSuccess clear.

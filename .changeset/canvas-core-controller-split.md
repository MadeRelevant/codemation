---
"@codemation/canvas-core": minor
---

feat(canvas-core): split useWorkflowDetailController into five sub-controllers (Story F)

Extracts the 1.5k-LOC `useWorkflowDetailController` mega-hook into five focused sub-controllers:

- `useWorkflowRunController` — run start/stop, status, current step, run history, credential health.
- `useWorkflowInspectController` — node selection, inspector panel state, resize, properties panel.
- `useWorkflowPinController` — pinned-output editing (toggle, edit, clear).
- `useWorkflowJsonEditController` — modal JSON editor dialog state.
- `useWorkflowTestSuiteController` — NEW standalone controller for test-suite state (not part of façade).

The original `useWorkflowDetailController` is preserved as a façade that composes the four run/inspect/pin/json-edit sub-controllers and returns the same shape it always did — no breaking changes for existing consumers.

Each sub-controller ships with:

- A typed return interface (`Workflow*ControllerReturn.types.ts`)
- A compile-time contract test that pins the return type against the interface

All new hooks and types are re-exported from the package public surface.

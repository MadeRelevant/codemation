---
"@codemation/canvas-core": minor
"@codemation/canvas": minor
---

Fix canvas edge/label flicker by switching to React Flow controlled mode with a surgical realtime patch pipeline.

- `WorkflowCanvas` now uses `useNodesState`/`useEdgesState` (controlled mode) with a two-track update strategy: ELK layout seeds the canvas once per structural change; realtime events apply minimal `NodeReplaceChange`/`EdgeReplaceChange` patches via `useWorkflowCanvasRealtimePatches`
- `WorkflowCanvasRealtimePatchPlanner` computes the minimal set of node and edge changes per realtime snapshot event, short-circuiting when no visible state changed
- `useWorkflowCanvasRealtimePatches` hook wires the planner into the controlled canvas state, resetting prev-snapshot tracking after a re-seed
- Monotonic snapshot merge in `realtimeRunMutations` prevents canvas from regressing (e.g. `completed → queued`) when converging branches re-activate a node
- New `computeWorkflowPositionedLayout` separates ELK position resolution from the React Flow overlay so realtime events never trigger a full ELK re-layout
- Eliminates edge drops caused by `useRunQuery` returning `undefined` for one render cycle when `activeLiveRunId` changes from null to a new value

---
"@codemation/canvas-core": patch
"@codemation/canvas": patch
---

feat(canvas): topological status cap — mask premature fan-in completion in canvas rendering

Adds `WorkflowCanvasTopologicalStatusCap` which ensures the canvas never displays a node as more progressed than its slowest sequential upstream. In fan-out/fan-in patterns (e.g. `.if()` emitting to both a branch and a downstream merge node simultaneously), the merge node now stays in `running` state visually until all branch predecessors reach a terminal state. Engine truth is untouched; this is a pure visualization projection applied in the patch planner and the seed effect.

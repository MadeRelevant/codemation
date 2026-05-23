---
"@codemation/canvas-core": patch
---

Sprint 9 Story J cleanup: remove dead WorkflowDetailControllerReturn.types.ts (~101 LOC). The type was a parallel definition never imported by any consumer — confirmed via grep across both repos. canvas-core's public API is unchanged.

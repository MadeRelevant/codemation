---
"@codemation/canvas": patch
---

test(canvas): push @codemation/canvas coverage to ≥90% lines (Sprint 16 Story 01)

Added 241 new behavioral tests across 37 new test files covering panels, canvas components, and screens. Added coverage.all + include/exclude configuration to vitest.ui.config.ts with documented exclusions for ReactFlow-dependent files (WorkflowCanvas, CodemationNode handles), Monaco Editor (WorkflowJsonEditorDialog), WebSocket provider, and CSS fetch components.

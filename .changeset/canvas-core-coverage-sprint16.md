---
"@codemation/canvas-core": patch
---

test(canvas-core): push coverage to ≥90% (Sprint 16 Story 01 — canvas-core work unit)

Added targeted tests for pure utility classes covering previously uncovered branches:
WorkflowCanvasBuiltinIconRegistry, WorkflowCanvasEdgeStyleResolver,
WorkflowCanvasLucideIconRegistry, WorkflowCanvasNodeGeometry (extended geometry methods),
WorkflowCanvasLabelLayoutEstimator (long-word edge cases), WorkflowCanvasEdgeCountResolver
(languageModel/nestedAgent fallback paths), HumanFriendlyTimestampFormatter,
WorkflowQueryRetryPolicy, WorkflowDetailUrlCodec, WorkflowActivationHttpErrorFormat,
RunRoomSubscriptionTracker, PageVisibilityIdleTimer, realtimeQueryKeys,
WorkflowExecutionTreeBuilder, useWorkflowJsonEditController, and context hooks.

Configured coverage.all: true + include: src/\*\* with documented exclusions for type-only
files, ELK async layout, hook files requiring TanStack Query context, and large
factory/adapter files covered by canvas package integration tests.

Lines coverage: 94.46% (well above the new 90% threshold).

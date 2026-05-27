---
"@codemation/core": minor
"@codemation/host": minor
---

HITL story 11: DSL `.humanApproval()` sugar + `hitl.task.*` telemetry span events

**core:**

- `ChainCursor.humanApproval(node, config, metadata?)` — chainable DSL shorthand for `.then(node.create(...))` that signals HITL suspension intent and throws at build time if the node is not a `defineHumanApprovalNode` result
- `isHumanApprovalNode(node)` predicate exported from `@codemation/core`
- `CodemationTelemetryAttributeNames` gains `hitlTaskId`, `hitlChannel`, `hitlDecisionStatus` constants
- `NodeSuspensionHandler` emits `hitl.task.created` and `hitl.task.delivery_failed` span events on the per-node telemetry scope

**host:**

- `ResumeTelemetryContextForRun` helper reconstructs `ExecutionTelemetry` for a run resuming from HITL state (trace context re-derived deterministically from `runId`)
- `DecideHumanTaskCommandHandler` emits `hitl.task.decided` span event after marking the task decided
- `HitlTimeoutWorker` emits `hitl.task.timed_out` span event for both auto-accept and halt paths

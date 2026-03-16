# Engine Behavior Contract

This document freezes the behavior the engine refactor must preserve. The source of truth is the existing test suite, not the current runtime shape.

## Capability Matrix

| Capability | What must remain true | Primary tests |
| --- | --- | --- |
| Linear execution | Nodes execute in graph order and completed runs resolve final outputs from the workflow tail. | `packages/core/test/engine.flows.test.ts` |
| Trigger handling | Trigger nodes bootstrap correctly and executable triggers can start ordinary runs. | `packages/core/test/engine.flows.test.ts`, `packages/core/test/engine.webhooks.test.ts` |
| Fan-out and fan-in | Branching and merge-style nodes preserve dependency semantics and only activate when required inputs are satisfied. | `packages/core/test/engine.flows.test.ts` |
| Batch semantics | Nodes receive batches and downstream activations preserve item counts and provenance. | `packages/core/test/engine.flows.test.ts` |
| Subworkflow execution | Child workflow runs keep parent references and resolve nested outputs through the workflow runner contract. | `packages/core/test/engine.flows.test.ts`, `packages/core/test/engine.offload.test.ts` |
| Worker offload and resume | Worker-hinted nodes persist pending state, survive serialization, and resume through the same activation id. | `packages/core/test/engine.offload.test.ts`, `packages/core/test/engine.targetedExecution.test.ts` |
| Snapshot replay across code drift | Persisted workflow snapshots continue to resolve tokens and replay runs even when live code moved on. | `packages/core/test/persistedWorkflowRoundtrip.test.ts`, `packages/core/test/engine.flows.test.ts` |
| Current-state execution | Running from persisted state honors `stopCondition`, frontier planning, and `clearFromNodeId` semantics. | `packages/core/test/engine.targetedExecution.test.ts` |
| Pinned-output skipping | Pinned outputs survive clear-from-node, preserve downstream satisfaction, and produce skipped snapshots instead of re-executing the pinned node. | `packages/core/test/engine.targetedExecution.test.ts`, `packages/frontend/test/workflowDetail/mutableExecutionFlows.test.tsx` |
| Webhook respond-now flows | Trigger-thrown webhook control signals either complete immediately or respond immediately and continue processing. | `packages/core/test/engine.webhooks.test.ts` |
| Run event publication | Queue, start, completion, and failure snapshots are published as run events with stable snapshot payloads. | `packages/core/test/run-events.test.ts` |
| Endpoint-to-trigger matching | A registered webhook endpoint can be matched back to the owning workflow trigger without frontend graph knowledge. | `packages/core/test/engine.webhooks.test.ts` plus matcher tests added during this refactor |

## Refactor Rule

Refactor acceptance means:

- the matrix above stays green
- higher-level intent APIs may replace low-level callers
- internal classes may move or split
- no behavior may be removed unless a test is intentionally changed with a matching product decision

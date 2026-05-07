---
"@codemation/core": patch
"@codemation/host": minor
"@codemation/next-host": minor
---

feat: deep-link from parent run to specific subworkflow execution

Adds `childRunId` to `NodeExecutionSnapshot` so the UI can navigate directly to the
child run when a `SubWorkflow` node is selected in the execution inspector, instead of
only linking to the child workflow's editor. Fixes the gap from PR #131.

- `@codemation/core` (patch): `NodeExecutionSnapshot` gains `childRunId?: RunId`;
  `ExecutionInstanceDto` gains `childRunId?: string`;
  `NodeExecutionStatePublisher` gains optional `setChildRunId` method;
  `NodeExecutionSnapshotFactory` propagates `previous.childRunId` through
  `completed`, `failed`, and `skipped` transitions.
- `@codemation/host` (minor): `ExecutionInstance` table gains `child_run_id` column
  (nullable, backward-compatible); `PrismaWorkflowRunRepository` persists and reads
  `childRunId` on node-activation snapshots.
- `@codemation/next-host` (minor): `NodeExecutionSnapshot` type gains `childRunId`;
  `WorkflowExecutionInspectorDetailBody` renders "Open subworkflow run" (with
  `?run=<childRunId>`) when a child run id is present, falling back to
  "Open subworkflow editor" for pre-existing snapshots.

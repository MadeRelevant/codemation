---
"@codemation/core": minor
"@codemation/core-nodes": minor
"@codemation/core-nodes-msgraph": minor
"@codemation/core-nodes-gmail": minor
"@codemation/next-host": patch
---

feat(core-nodes,msgraph,gmail): inspectorSummary on every built-in node

Implements `inspectorSummary()` on all built-in node and trigger config classes so the workflow
inspector panel introduced in #136 has content for every shipped node.

- `@codemation/core`: extends `definePollingTrigger` to accept and plumb an `inspectorSummary`
  option, mirroring the existing `defineNode` / `defineBatchNode` pattern. Also extends
  `defineRestNode` (in `@codemation/core-nodes`) with the same option.
- `@codemation/core-nodes`: `inspectorSummary()` on `HttpRequest`, `AIAgent`, `CronTrigger`,
  `ManualTrigger`, `SubWorkflow`, `Callback`, `If`, `Switch`, `Filter`, `Split`, `Merge`,
  `Wait`, `WebhookTrigger`, `TestTrigger`, `Aggregate`, `MapData`, `Assertion`.
- `@codemation/core-nodes-msgraph`: `inspectorSummary` option on all 17 mail/drive/excel nodes
  plus the `onNewMsGraphMailTrigger` polling trigger.
- `@codemation/core-nodes-gmail`: `inspectorSummary()` on `OnNewGmailTrigger`.
  Gmail action nodes (`SendGmailMessage`, `ReplyToGmailMessage`, `ModifyGmailLabels`) return
  `undefined` — all their config is per-item via `inputSchema`, nothing to surface at design time.
- `@codemation/core`: `WorkflowSnapshotCodec.serializeConfig` now pre-serializes the result of
  `inspectorSummary()` into the snapshot JSON as `_inspectorSummary` so the browser-side mapper
  can surface the same rows without calling class methods.
- `@codemation/next-host`: `PersistedWorkflowSnapshotMapper` now reads `_inspectorSummary` from
  the serialized config and includes it in the node DTO, maintaining parity with the live mapper.

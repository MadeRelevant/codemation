---
"@codemation/host": minor
"@codemation/next-host": minor
---

feat: SubWorkflow editor link, workflow info popover, and child-run navigation

- **2.3a** — SubWorkflow nodes in the node-properties panel now show an "Open in editor" link that navigates to the referenced workflow. Requires the new `referencedWorkflowId` field added to `WorkflowNodeDto` (populated from `SubWorkflow.workflowId` in `WorkflowDefinitionMapper` and `PersistedWorkflowSnapshotMapper`).
- **2.3b** — A workflow info popover (ⓘ icon) appears in the detail-page header, showing workflow id, discovery-path segments, trigger type, and active status.
- **2.4** — When a SubWorkflow node is selected in the execution inspector, an "Open workflow" link appears navigating to that child workflow's editor. Note: jump to the _specific child run_ is not yet possible because the parent's node execution snapshot does not carry the child `runId`; this is a backend follow-up item.

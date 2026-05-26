---
"@codemation/core": minor
---

feat(core): HITL story 04 — defineHumanApprovalNode authoring API + fast-forward decision semantics

Adds `defineHumanApprovalNode` to `packages/core/src/authoring/defineHumanApprovalNode.types.ts`.
Channel authors write `deliver` + optional `onDecision`/`onTimeout` callbacks; the helper
synthesizes a `SuspensionRequest`-throwing `execute` on the first call and merges a `decision`
key into `item.json` on resume. Binary attachments are passed through by reference. Predicate
re-resolution on resume is documented in JSDoc (option c from the spec). Story 10's tool
attachment hint is carried via the `humanApprovalToolBehavior` marker field.

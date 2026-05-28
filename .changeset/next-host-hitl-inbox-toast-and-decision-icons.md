---
"@codemation/next-host": patch
"@codemation/canvas-core": patch
"@codemation/canvas": patch
---

feat(hitl): toast feedback on inbox decisions + distinct approved/rejected node icons

- Dev inbox now surfaces sonner toast feedback when a HITL task is approved or
  rejected (and on decide failures), and sends the correctly-wrapped
  `{ decision: { approved } }` body to the decide endpoint.
- Canvas node status now models the HITL terminal statuses
  (`hitl-approved`/`hitl-rejected`/`hitl-timeout`/`hitl-auto-accepted`/`hitl-cancelled`)
  and renders distinct icons — a person-with-check for approved and
  person-with-x for rejected — instead of the plain "completed" checkbox.

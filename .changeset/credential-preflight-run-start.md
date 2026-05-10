---
"@codemation/host": patch
---

perf(host): reject workflow runs immediately when required credential slots are unbound

`StartWorkflowRunCommandHandler` now calls
`CredentialBindingService.assertRequiredCredentialsBound` before queuing any
node activations. The check does a single DB query (all bindings for the
workflow) and walks every slot including deeply-nested ones in AI agent nodes
(language model, node-backed tools, nested agents) via
`WorkflowCredentialNodeResolver.listSlots`. If any required slot has no
binding the request fails with a 400 before the run record is created, so the
user sees a clear error message instead of waiting for the run to start and
then fail several seconds later.

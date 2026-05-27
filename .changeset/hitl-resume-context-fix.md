---
"@codemation/core": patch
"@codemation/host": patch
---

fix(core): thread resumeContext through inline activation path

`RunContinuationService.resumeRun` was building the resumed activation request without `resumeContext`. On the inline scheduler path (`InlineDrivingScheduler`), `nodeExecutor.execute` is called directly — bypassing `NodeExecutionRequestHandlerService` which is the only place that splices `resumeContext` from `state.pendingResume`. As a result `ctx.resumeContext` was always `undefined` on the first execute call after a HITL decision, causing `defineHumanApprovalNode` to re-suspend instead of routing to `onDecision`.

The fix passes `{ ...base, resumeContext: args.resumeContext }` to `createSingleFromDefinitionWithActivation`. On the worker path (BullMQ), `NodeExecutionRequestHandlerService` still re-derives `resumeContext` from `state.pendingResume` — passing it here is additive and harmless.

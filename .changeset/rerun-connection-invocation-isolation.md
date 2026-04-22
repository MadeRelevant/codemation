---
"@codemation/core": patch
"@codemation/host": patch
---

Fix `Unique constraint failed on the fields: (instance_id)` crash when rerunning a workflow that contains an AI agent.

Reproduction: build `Manual trigger → AI agent → node → node`, click play on the agent, then click play on the next node (sometimes twice). The second run would fail at `PrismaWorkflowRunRepository.saveOnce` with a Postgres PK violation on the `ExecutionInstance` table.

Root cause: `RunStartService.createRunCurrentState` was deep-copying the prior run's `connectionInvocations` verbatim into the new run's initial state. Each record kept its original globally-unique `invocationId`, which is the primary key in `ExecutionInstance`. `saveOnce`'s existing-row lookup is scoped to the current `runId`, so the collision against the prior run's rows was only detected by Postgres when the insert fired.

Beyond the crash, the old behavior was also a data-model lie for compliance / OTEL: a `ConnectionInvocationRecord` represents a single auditable LLM / tool call and must belong to exactly one run. Copying it into another run made the same event appear to have happened twice.

Fix (domain + defense-in-depth):

- `@codemation/core` — `RunStartService.createRunCurrentState` now starts new runs with an empty invocation ledger. The prior run's invocations remain queryable on that run's persisted state (their true owner).
- `@codemation/host` — `PrismaWorkflowRunRepository.buildExecutionInstances` skips any invocation whose `runId` differs from the run being saved, so a stray carry-over from any other code path self-heals instead of crashing the save.

UI impact: none for the historical-run view (it reads invocations directly from the selected run). The client-side debugger overlay continues to surface the prior run's invocations locally during a rerun, and inspector telemetry already fetches against each invocation's original `runId`.

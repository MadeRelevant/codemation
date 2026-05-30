---
"@codemation/host": patch
---

fix(hitl): gate the HITL timeout scheduler/worker on the scheduler abstraction instead of hardcoding Redis

`HitlTimeoutJobScheduler` and `HitlTimeoutWorker` previously fell back to
`redis://127.0.0.1:6379` unconditionally and always constructed a BullMQ
`Queue`/`Worker`. In inline/local mode (no Redis — e.g. managed workspace pods),
this caused two failures: the host crash-spammed `ECONNREFUSED 127.0.0.1:6379`,
and a HITL decision hung in `cancelTimeoutJob` (against the dead Redis) before the
run could resume, so the CP relay timed out (500) and the run never completed.

Both now gate on `appConfig.scheduler.kind` — the same abstraction the rest of the
host uses (`bullmq` only when a Redis URL is present, otherwise `local`). In local
mode they never touch Redis: `enqueueTimeoutJob`/`cancelTimeoutJob` are inert
no-ops and `start()` constructs no worker. Behavior is unchanged for Redis-backed
(`bullmq`) deployments.

Trade-off: in local mode, HITL expiry timeouts (auto-accept/halt on expiry) do not
fire, since there is no background queue. Manual decisions resume the run normally.

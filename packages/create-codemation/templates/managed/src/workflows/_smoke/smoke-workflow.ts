import { Callback, CronTrigger, createWorkflowBuilder } from "@codemation/core-nodes";

/**
 * Sprint 3 Story 8 — Smoke workflow for managed workspace lifecycle testing.
 *
 * Fires every 10 seconds (for fast smoke feedback).
 * Emits a single item with event: "SMOKE_TICK" that the smoke script can wait for
 * as a run event over the WebSocket connection.
 *
 * This workflow ships pre-installed in the managed scaffold template. It exists
 * to give the e2e smoke test a guaranteed run event within 30 s of workspace
 * readiness. DO NOT add heavy dependencies — this workflow runs in every
 * provisioned workspace.
 */
export default createWorkflowBuilder({
  id: "wf.smoke.heartbeat",
  name: "[Smoke] Heartbeat",
})
  .trigger(new CronTrigger("Every 10 seconds", { schedule: "*/10 * * * * *", timezone: "UTC" }))
  .then(
    new Callback("Emit smoke tick", () => {
      return [{ json: { event: "SMOKE_TICK", timestamp: new Date().toISOString() } }];
    }),
  )
  .build();

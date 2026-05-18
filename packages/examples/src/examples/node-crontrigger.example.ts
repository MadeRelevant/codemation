/**
 * @description Cron trigger fires every hour → HttpRequest polls a health endpoint → Callback logs status.
 * Demonstrates CronTrigger as the primary scheduled activation node. Non-manual triggers use createWorkflowBuilder.
 * @tags cron, schedule, polling, scheduled, periodic, trigger, timer, style:node
 * @uses @codemation/core-nodes, node:CronTrigger, node:HttpRequest
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, CronTrigger, HttpRequest, MapData } from "@codemation/core-nodes";
import type { HttpRequestOutputJson } from "@codemation/core-nodes";

type HealthStatus = Readonly<{
  url: string;
  ok: boolean;
  status: number;
  checkedAt: string;
}>;

export default createWorkflowBuilder({
  id: "example.node-crontrigger",
  name: "CronTrigger: hourly health check",
})
  // CronTrigger fires on a cron schedule (UTC by default, configurable via timezone).
  // It emits one empty item per scheduled tick; downstream nodes receive that item as input.
  // Use CronTrigger for scheduled polling, recurring reports, or time-based automations.
  .trigger(new CronTrigger("Every hour", { schedule: "0 * * * *", timezone: "UTC" }))
  .then(
    new HttpRequest("Poll health endpoint", {
      method: "GET",
      url: "https://api.example.com/health",
      headers: { "User-Agent": "codemation-health-check" },
    }),
  )
  .then(
    new MapData<HttpRequestOutputJson, HealthStatus>("Shape health status", (item) => ({
      url: item.json.url,
      ok: item.json.ok,
      status: item.json.status,
      checkedAt: new Date().toISOString(),
    })),
  )
  .build();

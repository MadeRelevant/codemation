import type { NodeInspectorSummaryRow, TriggerNodeConfig, TypeToken } from "@codemation/core";

import { Cron } from "croner";
import type { CronCallback } from "croner";

import { CronTriggerNode } from "./CronTriggerNode";

export type CronTickJson = { firedAt: string; scheduledFor: string };

/**
 * Schedules a workflow on a standard cron expression.
 *
 * Each tick emits one item: `{ firedAt: string, scheduledFor: string }` — both ISO-8601 timestamps.
 * `firedAt` is the wall-clock moment the callback ran; `scheduledFor` is the cron-computed
 * firing instant (these differ when the job was delayed).
 *
 * Timezone defaults to UTC when omitted — cron without an explicit TZ is a DST footgun.
 */
export class CronTrigger implements TriggerNodeConfig<CronTickJson> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = CronTriggerNode;
  readonly icon = "lucide:clock" as const;
  readonly id?: string;

  constructor(
    public readonly name: string,
    private readonly args: Readonly<{ schedule: string; timezone?: string }>,
    id?: string,
  ) {
    new Cron(args.schedule, { paused: true, timezone: args.timezone });
    this.id = id;
  }

  get schedule(): string {
    return this.args.schedule;
  }

  get timezone(): string | undefined {
    return this.args.timezone;
  }

  createJob(callback: CronCallback): Cron {
    return new Cron(this.args.schedule, { timezone: this.args.timezone, protect: true }, callback);
  }

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> {
    const rows: NodeInspectorSummaryRow[] = [{ label: "Schedule", value: this.args.schedule }];
    if (this.args.timezone) {
      rows.push({ label: "Timezone", value: this.args.timezone });
    }
    return rows;
  }
}

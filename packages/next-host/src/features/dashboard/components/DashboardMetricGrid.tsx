"use client";

import type { TelemetryDashboardSummaryDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Bot, Clock3, Cpu, Workflow } from "lucide-react";
import prettyMs from "pretty-ms";
import { Badge } from "@/components/ui/badge";
import { DashboardMetricCard } from "./DashboardMetricCard";

export function DashboardMetricGrid(props: Readonly<{ summary: TelemetryDashboardSummaryDto | undefined }>) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <DashboardMetricCard
        title="Total runs"
        value={props.summary ? String(props.summary.runs.totalRuns) : "—"}
        description="Workflow traces matching the current filter set."
        badge={
          <Badge variant="secondary" className="gap-1">
            <Workflow className="size-3.5" />
            Runs
          </Badge>
        }
        testId="dashboard-metric-total-runs"
      />
      <DashboardMetricCard
        title="Completed"
        value={props.summary ? String(props.summary.runs.completedRuns) : "—"}
        description="Successful workflow executions."
        badge={<Badge className="bg-emerald-600 text-white">OK</Badge>}
        testId="dashboard-metric-completed-runs"
      />
      <DashboardMetricCard
        title="Failed"
        value={props.summary ? String(props.summary.runs.failedRuns) : "—"}
        description="Runs that ended in a terminal failure."
        badge={<Badge variant="destructive">Failed</Badge>}
        testId="dashboard-metric-failed-runs"
      />
      <DashboardMetricCard
        title="Avg duration"
        value={props.summary ? prettyMs(props.summary.runs.averageDurationMs, { compact: true }) : "—"}
        description="Average run duration across the filtered sample."
        badge={
          <Badge variant="outline" className="gap-1">
            <Clock3 className="size-3.5" />
            Time
          </Badge>
        }
        testId="dashboard-metric-average-duration"
      />
      <DashboardMetricCard
        title="Total tokens"
        value={props.summary ? props.summary.ai.totalTokens.toLocaleString() : "—"}
        description="Combined input and output tokens."
        badge={
          <Badge variant="secondary" className="gap-1">
            <Bot className="size-3.5" />
            AI
          </Badge>
        }
        testId="dashboard-metric-total-tokens"
      />
      <DashboardMetricCard
        title="Input tokens"
        value={props.summary ? props.summary.ai.inputTokens.toLocaleString() : "—"}
        description="Prompt-side token usage."
        testId="dashboard-metric-input-tokens"
      />
      <DashboardMetricCard
        title="Output tokens"
        value={props.summary ? props.summary.ai.outputTokens.toLocaleString() : "—"}
        description="Completion-side token usage."
        testId="dashboard-metric-output-tokens"
      />
      <DashboardMetricCard
        title="Reasoning tokens"
        value={props.summary ? props.summary.ai.reasoningTokens.toLocaleString() : "—"}
        description="Additional reasoning token usage where reported."
        badge={
          <Badge variant="outline" className="gap-1">
            <Cpu className="size-3.5" />
            Reasoning
          </Badge>
        }
        testId="dashboard-metric-reasoning-tokens"
      />
    </section>
  );
}

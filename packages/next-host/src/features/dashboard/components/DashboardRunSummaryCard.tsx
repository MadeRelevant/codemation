"use client";

import type { TelemetryDashboardSummaryDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Clock3, PlayCircle, Workflow } from "lucide-react";
import prettyMs from "pretty-ms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardRunSummaryCard(props: Readonly<{ summary: TelemetryDashboardSummaryDto | undefined }>) {
  return (
    <Card data-testid="dashboard-run-summary-card" className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Workflow runs</CardTitle>
            <CardDescription>Execution health and throughput for the current filter set.</CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <Workflow className="size-3.5" />
            Runs
          </Badge>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total runs</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight" data-testid="dashboard-metric-total-runs">
            {props.summary ? String(props.summary.runs.totalRuns) : "—"}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed</div>
            <div className="mt-1 text-xl font-semibold text-emerald-700" data-testid="dashboard-metric-completed-runs">
              {props.summary ? String(props.summary.runs.completedRuns) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Failed</div>
            <div className="mt-1 text-xl font-semibold text-destructive" data-testid="dashboard-metric-failed-runs">
              {props.summary ? String(props.summary.runs.failedRuns) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <PlayCircle className="size-3.5" />
              Running
            </div>
            <div className="mt-1 text-xl font-semibold">
              {props.summary ? String(props.summary.runs.runningRuns) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock3 className="size-3.5" />
              Avg duration
            </div>
            <div className="mt-1 text-xl font-semibold" data-testid="dashboard-metric-average-duration">
              {props.summary ? prettyMs(props.summary.runs.averageDurationMs, { compact: true }) : "—"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import type { TelemetryDashboardTimeseriesDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DashboardDateTimeFormatter } from "../lib/DashboardDateTimeFormatter";
import { DashboardStatusPresentation } from "../lib/DashboardStatusPresentation";
import { DashboardChartCard } from "./DashboardChartCard";
import { DashboardRunStatusTooltip } from "./DashboardRunStatusTooltip";

export function DashboardRunStatusChart(props: Readonly<{ series: TelemetryDashboardTimeseriesDto }>) {
  const data = props.series.buckets.map((bucket) => ({
    label: DashboardDateTimeFormatter.formatBucketLabel(props.series.interval, bucket.bucketStartIso),
    completedRuns: bucket.completedRuns,
    failedRuns: bucket.failedRuns,
    runningRuns: bucket.runningRuns,
  }));
  return (
    <DashboardChartCard
      title="Workflow run status"
      description="Completed, failed, and running runs across the selected time range."
      testId="dashboard-run-status-chart-card"
    >
      <div className="min-h-[280px] min-w-0 h-[280px] w-full" data-testid="dashboard-run-status-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip content={<DashboardRunStatusTooltip />} />
            <Bar
              dataKey="completedRuns"
              name="Completed"
              stackId="runs"
              fill={DashboardStatusPresentation.completedColor}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="failedRuns"
              name="Failed"
              stackId="runs"
              fill={DashboardStatusPresentation.failedColor}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="runningRuns"
              name="Running"
              stackId="runs"
              fill={DashboardStatusPresentation.runningColor}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}

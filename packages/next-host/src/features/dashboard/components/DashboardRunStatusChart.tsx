"use client";

import type { TelemetryDashboardTimeseriesDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DashboardChartCard } from "./DashboardChartCard";

export function DashboardRunStatusChart(props: Readonly<{ series: TelemetryDashboardTimeseriesDto }>) {
  const data = props.series.buckets.map((bucket) => ({
    label: bucket.bucketStartIso.slice(0, 10),
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
      <div className="h-[280px] w-full" data-testid="dashboard-run-status-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="completedRuns" stackId="runs" fill="var(--color-chart-1, #2563eb)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="failedRuns" stackId="runs" fill="var(--color-chart-2, #dc2626)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="runningRuns" stackId="runs" fill="var(--color-chart-3, #0f766e)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}

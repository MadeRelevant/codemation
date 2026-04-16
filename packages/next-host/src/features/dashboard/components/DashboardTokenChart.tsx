"use client";

import type { TelemetryDashboardTimeseriesDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardDateTimeFormatter } from "../lib/DashboardDateTimeFormatter";
import { DashboardChartCard } from "./DashboardChartCard";

export function DashboardTokenChart(props: Readonly<{ series: TelemetryDashboardTimeseriesDto }>) {
  const [mode, setMode] = useState<"total" | "breakdown">("total");
  const data = props.series.buckets.map((bucket) => ({
    label: DashboardDateTimeFormatter.formatBucketLabel(props.series.interval, bucket.bucketStartIso),
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    totalTokens: bucket.totalTokens,
    cachedInputTokens: bucket.cachedInputTokens,
    reasoningTokens: bucket.reasoningTokens,
  }));
  return (
    <DashboardChartCard
      title="Token usage"
      description="AI token volume over time for the selected workflows and models."
      testId="dashboard-token-chart-card"
    >
      <div className="flex items-center justify-between gap-3 pb-4">
        <Tabs value={mode} onValueChange={(value) => setMode(value as "total" | "breakdown")}>
          <TabsList>
            <TabsTrigger value="total" data-testid="dashboard-token-chart-total">
              Total
            </TabsTrigger>
            <TabsTrigger value="breakdown" data-testid="dashboard-token-chart-breakdown">
              Breakdown
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-[280px] min-w-0 h-[280px] w-full" data-testid="dashboard-token-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
          <AreaChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip />
            {mode === "total" ? (
              <Area
                type="monotone"
                dataKey="totalTokens"
                stroke="var(--color-chart-1, #2563eb)"
                fill="var(--color-chart-1, #2563eb)"
                fillOpacity={0.18}
              />
            ) : (
              <>
                <Area
                  type="monotone"
                  dataKey="inputTokens"
                  stackId="tokens"
                  stroke="var(--color-chart-1, #2563eb)"
                  fill="var(--color-chart-1, #2563eb)"
                  fillOpacity={0.18}
                />
                <Area
                  type="monotone"
                  dataKey="outputTokens"
                  stackId="tokens"
                  stroke="var(--color-chart-2, #7c3aed)"
                  fill="var(--color-chart-2, #7c3aed)"
                  fillOpacity={0.18}
                />
                <Area
                  type="monotone"
                  dataKey="cachedInputTokens"
                  stackId="tokens"
                  stroke="var(--color-chart-3, #0f766e)"
                  fill="var(--color-chart-3, #0f766e)"
                  fillOpacity={0.18}
                />
                <Area
                  type="monotone"
                  dataKey="reasoningTokens"
                  stackId="tokens"
                  stroke="var(--color-chart-4, #d97706)"
                  fill="var(--color-chart-4, #d97706)"
                  fillOpacity={0.18}
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}

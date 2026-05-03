"use client";

import type { TestSuiteRunSummaryDto } from "@codemation/host/dto";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TestSuitePassRateChartProps {
  readonly suiteRuns: ReadonlyArray<TestSuiteRunSummaryDto>;
}

interface DataPoint {
  readonly idx: number;
  readonly startedAt: string;
  readonly passRatePct: number;
  readonly totalCases: number;
}

/**
 * Pass-rate over time across all TestSuiteRuns of one workflow. Phase 1 inputs are
 * **rolling-input** (each suite re-fetches fixtures live); the parent panel labels the chart
 * accordingly so trends aren't read as agent-quality regressions when really the inputs drifted.
 */
export function TestSuitePassRateChart(props: TestSuitePassRateChartProps) {
  const data = useMemo<ReadonlyArray<DataPoint>>(() => {
    const ordered = [...props.suiteRuns].reverse();
    return ordered.map((run, idx) => ({
      idx,
      startedAt: run.startedAt,
      passRatePct: run.totalCases > 0 ? (run.passedCases / run.totalCases) * 100 : 0,
      totalCases: run.totalCases,
    }));
  }, [props.suiteRuns]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No test suite runs yet — pass-rate chart will appear after the first run.
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...data]} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="startedAt"
            tickFormatter={(value: string) => new Date(value).toLocaleDateString()}
            fontSize={11}
          />
          <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} fontSize={11} />
          <Tooltip
            labelFormatter={(label) => (typeof label === "string" ? new Date(label).toLocaleString() : "")}
            formatter={(value, _name, ctx) => {
              const numeric = typeof value === "number" ? value : 0;
              const point = (ctx as { payload?: DataPoint } | undefined)?.payload;
              return [`${numeric.toFixed(1)}% (${point?.totalCases ?? 0} cases)`, "Pass rate"];
            }}
          />
          <Line type="monotone" dataKey="passRatePct" stroke="#10b981" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

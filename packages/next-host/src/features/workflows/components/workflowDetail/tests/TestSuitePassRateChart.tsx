"use client";

import type { AssertionMetricTrendDto, TestSuiteRunSummaryDto } from "@codemation/host/dto";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TestSuitePassRateChartProps {
  readonly suiteRuns: ReadonlyArray<TestSuiteRunSummaryDto>;
  /**
   * Names the user has chosen to plot as extra trend lines. Each name should match one of the
   * `name`s in {@link metricTrends}. When empty (the default), only the pass-rate line is shown.
   */
  readonly selectedMetrics?: ReadonlyArray<string>;
  /**
   * Per-metric trends across suite runs. Optional — falls back to a pass-rate-only chart when
   * absent or empty. Caller is responsible for ensuring the trends cover the same workflow as
   * `suiteRuns`.
   */
  readonly metricTrends?: ReadonlyArray<AssertionMetricTrendDto>;
}

/** Stable color cycle for additional metric lines. Avoids importing a color library. */
const METRIC_LINE_COLORS = [
  "#3b82f6", // blue-500
  "#f59e0b", // amber-500
  "#a855f7", // purple-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
] as const;

const METRIC_DATA_KEY_PREFIX = "metric:";

interface DataPoint {
  readonly idx: number;
  readonly testSuiteRunId: string;
  readonly startedAt: string;
  readonly passRatePct: number;
  readonly totalCases: number;
  /** Open shape for the metric columns: `metric:<name>` → percent (0..100) or `null` (no data). */
  readonly [metricKey: `metric:${string}`]: number | null | string | undefined;
}

/**
 * Chart for the Tests panel's left rail. Renders the workflow's pass-rate over time as the
 * primary line, plus an optional multi-metric overlay where each selected assertion name maps
 * to a `<Line>` plotting **mean score across all cases × 100** for that name within each suite
 * run. Both axes share the 0..100 scale so users can read pass-rate and metric scores together.
 *
 * When the user has metric lines selected, the pass-rate line is rendered dashed to fade it
 * into a baseline reference.
 *
 * Phase 1 inputs are **rolling-input** (each suite re-fetches fixtures live); the parent panel
 * labels the chart accordingly so trends aren't read as agent-quality regressions when really
 * the inputs drifted.
 */
export function TestSuitePassRateChart(props: TestSuitePassRateChartProps) {
  const selectedMetrics = props.selectedMetrics ?? [];
  const metricTrends = props.metricTrends ?? [];
  const hasMetricLines = selectedMetrics.length > 0;

  const data = useMemo<ReadonlyArray<DataPoint>>(() => {
    const ordered = [...props.suiteRuns].reverse();
    const trendsByName = new Map<string, AssertionMetricTrendDto>(metricTrends.map((t) => [t.name, t]));
    return ordered.map((run, idx) => {
      const metricColumns: Record<string, number | null> = {};
      for (const name of selectedMetrics) {
        const trend = trendsByName.get(name);
        const found = trend?.perSuiteRun.find((p) => p.testSuiteRunId === run.id);
        // `null` (vs. omission) tells recharts "missing point — break the line here".
        metricColumns[`${METRIC_DATA_KEY_PREFIX}${name}`] = found !== undefined ? found.meanScore * 100 : null;
      }
      const point: DataPoint = {
        idx,
        testSuiteRunId: run.id,
        startedAt: run.startedAt,
        passRatePct: run.totalCases > 0 ? (run.passedCases / run.totalCases) * 100 : 0,
        totalCases: run.totalCases,
        ...metricColumns,
      };
      return point;
    });
  }, [props.suiteRuns, metricTrends, selectedMetrics]);

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
            formatter={(value, name, ctx) => {
              const numeric = typeof value === "number" ? value : 0;
              const point = (ctx as { payload?: DataPoint } | undefined)?.payload;
              if (name === "Overall pass rate") {
                return [`${numeric.toFixed(1)}% (${point?.totalCases ?? 0} cases)`, "Pass rate"];
              }
              return [`${numeric.toFixed(1)}% (mean score)`, String(name)];
            }}
          />
          {hasMetricLines ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
          <Line
            type="monotone"
            dataKey="passRatePct"
            name="Overall pass rate"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray={hasMetricLines ? "4 3" : undefined}
            dot
          />
          {selectedMetrics.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={`${METRIC_DATA_KEY_PREFIX}${name}`}
              name={name}
              stroke={METRIC_LINE_COLORS[i % METRIC_LINE_COLORS.length]}
              strokeWidth={2}
              dot
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

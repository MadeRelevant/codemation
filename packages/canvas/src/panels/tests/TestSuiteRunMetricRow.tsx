"use client";

import { TestSuiteRunDeltaBadge } from "./TestSuiteRunDeltaBadge";

export interface TestSuiteRunMetricRowData {
  readonly name: string;
  /** Mean score in the **current** suite run, 0..1. */
  readonly currentMean: number;
  readonly currentSamples: number;
  readonly currentFailing: boolean;
  /** Mean score in the **previous** suite run if one exists, else `null`. */
  readonly previousMean: number | null;
  /** `currentMean − previousMean` (0..1 scale) or `null` when there's no previous run yet. */
  readonly delta: number | null;
}

interface TestSuiteRunMetricRowProps {
  readonly row: TestSuiteRunMetricRowData;
}

/** One row of {@link TestSuiteRunMetricsComparison}: metric name, current %, prev %, delta badge. */
export function TestSuiteRunMetricRow(props: TestSuiteRunMetricRowProps) {
  const { row } = props;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 py-1.5 text-xs">
      <span className={`truncate font-medium ${row.currentFailing ? "text-destructive" : ""}`} title={row.name}>
        {row.name}
      </span>
      <span className="font-mono text-muted-foreground" title="Current run mean score">
        cur <strong className="font-semibold text-foreground">{(row.currentMean * 100).toFixed(1)}%</strong>
      </span>
      <span className="font-mono text-muted-foreground" title="Previous run mean score">
        prev{" "}
        {row.previousMean !== null ? (
          <strong className="font-semibold text-foreground">{(row.previousMean * 100).toFixed(1)}%</strong>
        ) : (
          <span className="text-foreground/60">—</span>
        )}
      </span>
      <TestSuiteRunDeltaBadge delta={row.delta} />
    </li>
  );
}

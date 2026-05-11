"use client";

import type { TestAssertionDto } from "@codemation/host/dto";
import { deriveAssertionPassed, DEFAULT_ASSERTION_PASS_THRESHOLD } from "@codemation/core/contracts";
import { useMemo } from "react";

import { TestSuiteRunMetricRow, type TestSuiteRunMetricRowData } from "./TestSuiteRunMetricRow";

interface TestSuiteRunMetricsComparisonProps {
  readonly currentAssertions: ReadonlyArray<TestAssertionDto>;
  readonly previousAssertions: ReadonlyArray<TestAssertionDto> | null;
  readonly previousLoading: boolean;
}

/**
 * Per-metric comparison shown at the top of {@link TestSuiteRunDetailPanel}: for each
 * assertion-name in **the current run**, compute the mean score, look up the same name in the
 * **previous run** (the second-most-recent suite run on the workflow), and render a delta with
 * an up/down arrow + green/red color so authors can see at a glance whether their last change
 * improved or regressed individual metrics.
 *
 * Pass/fail derivation goes through `deriveAssertionPassed` (score-based contract from the just-
 * landed Phase D refactor), and rows are ordered:
 *   1. failing-currently first (so regressions surface immediately),
 *   2. then by current score ascending.
 */
export function TestSuiteRunMetricsComparison(props: TestSuiteRunMetricsComparisonProps) {
  const rows = useMemo<ReadonlyArray<TestSuiteRunMetricRowData>>(() => {
    const currentByName = aggregateByName(props.currentAssertions);
    const previousByName = aggregateByName(props.previousAssertions ?? []);
    const result: TestSuiteRunMetricRowData[] = [];
    for (const [name, current] of currentByName) {
      const prev = previousByName.get(name);
      const previousMean = prev ? prev.mean : null;
      const delta = previousMean !== null ? current.mean - previousMean : null;
      result.push({
        name,
        currentMean: current.mean,
        currentSamples: current.samples,
        currentFailing: current.anyFailing,
        previousMean,
        delta,
      });
    }
    result.sort((a, b) => {
      // Failing rows float to the top.
      if (a.currentFailing !== b.currentFailing) {
        return a.currentFailing ? -1 : 1;
      }
      // Then by score ascending (lowest scores first inside each group).
      return a.currentMean - b.currentMean;
    });
    return result;
  }, [props.currentAssertions, props.previousAssertions]);

  if (rows.length === 0) {
    // Don't render the section at all when this run produced no assertions — the rest of the
    // detail panel already covers the empty state.
    return null;
  }

  return (
    <section data-testid="test-suite-run-metrics-comparison" className="border-b border-border px-6 py-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metrics vs previous run</h3>
        {props.previousAssertions === null && !props.previousLoading ? (
          <span className="text-[10px] text-muted-foreground">No previous run yet for comparison</span>
        ) : null}
      </header>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <TestSuiteRunMetricRow key={row.name} row={row} />
        ))}
      </ul>
    </section>
  );
}

interface NameAggregate {
  readonly mean: number;
  readonly samples: number;
  readonly anyFailing: boolean;
}

function aggregateByName(assertions: ReadonlyArray<TestAssertionDto>): Map<string, NameAggregate> {
  interface Mutable {
    sum: number;
    count: number;
    anyFailing: boolean;
  }
  const buckets = new Map<string, Mutable>();
  for (const a of assertions) {
    const existing = buckets.get(a.name);
    const failing = !deriveAssertionPassed({
      score: a.score,
      passThreshold: a.passThreshold ?? DEFAULT_ASSERTION_PASS_THRESHOLD,
      ...(a.errored === true ? { errored: true as const } : {}),
    });
    if (existing) {
      existing.sum += a.score;
      existing.count += 1;
      existing.anyFailing = existing.anyFailing || failing;
    } else {
      buckets.set(a.name, { sum: a.score, count: 1, anyFailing: failing });
    }
  }
  const result = new Map<string, NameAggregate>();
  for (const [name, m] of buckets) {
    result.set(name, {
      mean: m.count > 0 ? m.sum / m.count : 0,
      samples: m.count,
      anyFailing: m.anyFailing,
    });
  }
  return result;
}

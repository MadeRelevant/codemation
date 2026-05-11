"use client";

import type { TestAssertionDto, TestSuiteChildRunDto, TestSuiteRunDetailDto } from "@codemation/host/dto";
import { useMemo, useState } from "react";

import { useTestSuiteRunAssertionsQuery, useWorkflowTestSuiteRunsQuery } from "@codemation/canvas";

import { type TestSuiteCaseFilter, TestSuiteCaseFilterEngine } from "./TestSuiteCaseFilter";
import { TestSuiteCaseFilterStrip } from "./TestSuiteCaseFilterStrip";
import { TestSuiteRunDetailTreeTable } from "./TestSuiteRunDetailTreeTable";
import { TestSuiteRunMetricsComparison } from "./TestSuiteRunMetricsComparison";
import { TestSuiteRunStatusBadge } from "./TestSuiteRunStatusBadge";

interface TestSuiteRunDetailPanelProps {
  readonly workflowId: string;
  readonly suiteRun: TestSuiteRunDetailDto;
  readonly assertions: ReadonlyArray<TestAssertionDto>;
  readonly assertionsLoading: boolean;
  readonly childRuns: ReadonlyArray<TestSuiteChildRunDto>;
  readonly childRunsLoading: boolean;
}

export function TestSuiteRunDetailPanel(props: TestSuiteRunDetailPanelProps) {
  const suite = props.suiteRun;
  const passRatePct = suite.totalCases > 0 ? (suite.passedCases / suite.totalCases) * 100 : 0;
  const coverageCount = suite.nodeCoverage?.length ?? 0;

  // The "previous run" for the metric comparison is the workflow's second-most-recent suite
  // run *strictly older than this one* by `startedAt`. We rely on the suite-runs list query
  // (already cached by the parent panel) so opening the drilldown costs at most one extra
  // round-trip — for the previous run's assertions.
  const suiteRunsQuery = useWorkflowTestSuiteRunsQuery(props.workflowId);
  const previousSuiteRunId = useMemo<string | null>(() => {
    const list = suiteRunsQuery.data ?? [];
    let candidate: { readonly id: string; readonly startedAt: string } | null = null;
    for (const row of list) {
      if (row.id === suite.id) continue;
      if (row.startedAt >= suite.startedAt) continue;
      if (!candidate || row.startedAt > candidate.startedAt) {
        candidate = { id: row.id, startedAt: row.startedAt };
      }
    }
    return candidate?.id ?? null;
  }, [suiteRunsQuery.data, suite.id, suite.startedAt]);
  const previousAssertionsQuery = useTestSuiteRunAssertionsQuery(previousSuiteRunId);

  const [caseFilter, setCaseFilter] = useState<TestSuiteCaseFilter>("all");
  const filterCounts = useMemo(
    () => TestSuiteCaseFilterEngine.counts(props.childRuns, props.assertions),
    [props.childRuns, props.assertions],
  );
  const filteredChildRuns = useMemo(
    () => TestSuiteCaseFilterEngine.apply(props.childRuns, props.assertions, caseFilter),
    [props.childRuns, props.assertions, caseFilter],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{suite.triggerNodeName ?? suite.triggerNodeId}</h2>
          <TestSuiteRunStatusBadge status={suite.status} />
          <span className="text-xs text-muted-foreground">{new Date(suite.startedAt).toLocaleString()}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Pass rate</dt>
            <dd className="font-mono">
              {passRatePct.toFixed(1)}% ({suite.passedCases}/{suite.totalCases})
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Failed</dt>
            <dd className="font-mono">{suite.failedCases}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Concurrency</dt>
            <dd className="font-mono">{suite.concurrency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Nodes covered</dt>
            <dd className="font-mono">{coverageCount}</dd>
          </div>
        </dl>
        {suite.errorMessage ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {suite.errorMessage}
          </div>
        ) : null}
      </header>
      <TestSuiteRunMetricsComparison
        currentAssertions={props.assertions}
        previousAssertions={previousSuiteRunId !== null ? (previousAssertionsQuery.data ?? null) : null}
        previousLoading={previousSuiteRunId !== null && previousAssertionsQuery.isLoading}
      />
      <TestSuiteCaseFilterStrip value={caseFilter} onChange={setCaseFilter} counts={filterCounts} />
      <div className="min-h-0 flex-1 overflow-auto">
        {props.childRunsLoading && props.childRuns.length === 0 ? (
          <div className="px-6 py-3 text-sm text-muted-foreground">Loading test cases…</div>
        ) : props.childRuns.length > 0 && filteredChildRuns.length === 0 ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">
            No cases match the <strong>{caseFilter}</strong> filter. Try <strong>All</strong> to see every dispatched
            case.
          </div>
        ) : (
          <TestSuiteRunDetailTreeTable
            workflowId={props.workflowId}
            childRuns={filteredChildRuns}
            assertions={props.assertions}
          />
        )}
      </div>
    </div>
  );
}

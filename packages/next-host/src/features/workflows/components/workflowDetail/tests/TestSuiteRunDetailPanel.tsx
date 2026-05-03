"use client";

import type { TestAssertionDto, TestSuiteChildRunDto, TestSuiteRunDetailDto } from "@codemation/host/dto";

import { TestSuiteRunDetailTreeTable } from "./TestSuiteRunDetailTreeTable";
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
      <div className="min-h-0 flex-1 overflow-auto">
        {props.childRunsLoading && props.childRuns.length === 0 ? (
          <div className="px-6 py-3 text-sm text-muted-foreground">Loading test cases…</div>
        ) : (
          <TestSuiteRunDetailTreeTable
            workflowId={props.workflowId}
            childRuns={props.childRuns}
            assertions={props.assertions}
          />
        )}
      </div>
    </div>
  );
}

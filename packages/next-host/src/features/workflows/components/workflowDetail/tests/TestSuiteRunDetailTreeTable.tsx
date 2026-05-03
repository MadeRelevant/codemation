"use client";

import type { TestAssertionDto, TestSuiteChildRunDto } from "@codemation/host/dto";
import { useMemo } from "react";

import { TestSuiteCaseRow } from "./TestSuiteCaseRow";

interface TestSuiteRunDetailTreeTableProps {
  readonly workflowId: string;
  readonly childRuns: ReadonlyArray<TestSuiteChildRunDto>;
  readonly assertions: ReadonlyArray<TestAssertionDto>;
}

/**
 * Two-level expandable tree for the suite-detail view: each test case row collapses to a row
 * of assertion rows underneath. Driven by the `child runs` query so cases show up as soon as
 * they're dispatched (queued / running) — not just after they emit assertions. Combined with
 * realtime invalidation, the user sees cases stream from `running` → `completed`/`failed` live.
 *
 * Built on Radix `Collapsible` (the same primitive shadcn-ui uses across this codebase) so
 * behavior, accessibility, and animation match the rest of the app — no rolled-from-scratch
 * tree state machine.
 */
export function TestSuiteRunDetailTreeTable(props: TestSuiteRunDetailTreeTableProps) {
  const assertionsByRunId = useMemo(() => {
    const map = new Map<string, TestAssertionDto[]>();
    for (const a of props.assertions) {
      const list = map.get(a.runId) ?? [];
      list.push(a);
      map.set(a.runId, list);
    }
    return map;
  }, [props.assertions]);

  if (props.childRuns.length === 0) {
    return (
      <div className="px-6 py-6 text-sm text-muted-foreground">
        No test cases dispatched yet. Click <strong>Run tests</strong> to start the suite.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border" data-testid="test-suite-run-detail-tree-table">
      <div
        className="grid items-center gap-3 bg-muted/40 px-6 py-2 text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase"
        style={{ gridTemplateColumns: "auto minmax(0,1fr) auto auto auto" }}
      >
        <span aria-hidden className="w-3.5" />
        <span>Test case</span>
        <span>Status</span>
        <span className="text-right">Pass / Total</span>
        <span aria-hidden />
      </div>
      {props.childRuns.map((run) => (
        <TestSuiteCaseRow
          key={run.runId}
          workflowId={props.workflowId}
          run={run}
          assertions={assertionsByRunId.get(run.runId) ?? []}
        />
      ))}
    </div>
  );
}

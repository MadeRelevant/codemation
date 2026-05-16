"use client";

import { deriveAssertionPassed } from "@codemation/core/contracts";
import type { TestAssertionDto, TestSuiteChildRunDto } from "@codemation/host/dto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../../components/ui/button";

import { resolveDisplayedCaseStatus } from "./TestSuiteCaseStatusIcon";
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
 * Tree expansion state lives here (lifted from the rows) so the Collapse all / Expand all
 * buttons can broadcast to every row at once. New runs that stream in get auto-expanded only
 * if they look interesting (failed / errored / has any failing assertion); the user's explicit
 * collapse on a previously-auto-opened row is preserved across re-renders.
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

  const shouldAutoOpenForRun = useCallback(
    (run: TestSuiteChildRunDto, runAssertions: ReadonlyArray<TestAssertionDto>): boolean => {
      const status = resolveDisplayedCaseStatus(run);
      if (status === "failed" || status === "errored") return true;
      return runAssertions.some((a) => a.errored === true || !deriveAssertionPassed(a));
    },
    [],
  );

  const [expandedRunIds, setExpandedRunIds] = useState<ReadonlySet<string>>(new Set());
  // Track which run ids we've already considered for auto-open so we don't re-open a row the
  // user explicitly collapsed when realtime updates fire.
  const seededRunIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let next: Set<string> | null = null;
    for (const run of props.childRuns) {
      if (seededRunIdsRef.current.has(run.runId)) continue;
      seededRunIdsRef.current.add(run.runId);
      if (shouldAutoOpenForRun(run, assertionsByRunId.get(run.runId) ?? [])) {
        if (!next) next = new Set(expandedRunIds);
        next.add(run.runId);
      }
    }
    if (next) setExpandedRunIds(next);
    // `expandedRunIds` intentionally omitted from deps — the `seededRunIdsRef` gate already
    // prevents re-seeding on rerenders, and depending on `expandedRunIds` would re-trigger
    // this effect on every toggle (loop / wipe-out of user-collapsed rows).
  }, [props.childRuns, assertionsByRunId, shouldAutoOpenForRun]);

  const handleToggle = useCallback((runId: string) => {
    setExpandedRunIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedRunIds(new Set(props.childRuns.map((r) => r.runId)));
  }, [props.childRuns]);

  const collapseAll = useCallback(() => {
    setExpandedRunIds(new Set());
  }, []);

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
        <div className="col-span-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span>Test case · Status · Pass / Total</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              data-testid="test-suite-tree-collapse-all"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] font-bold normal-case tracking-normal"
              onClick={collapseAll}
            >
              Collapse all
            </Button>
            <Button
              type="button"
              data-testid="test-suite-tree-expand-all"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] font-bold normal-case tracking-normal"
              onClick={expandAll}
            >
              Expand all
            </Button>
          </div>
        </div>
      </div>
      {props.childRuns.map((run) => (
        <TestSuiteCaseRow
          key={run.runId}
          workflowId={props.workflowId}
          run={run}
          assertions={assertionsByRunId.get(run.runId) ?? []}
          isOpen={expandedRunIds.has(run.runId)}
          onToggle={() => handleToggle(run.runId)}
        />
      ))}
    </div>
  );
}

"use client";

import type { TestSuiteRunSummaryDto } from "@codemation/host/dto";

import { WorkflowDetailPresenter } from "@codemation/canvas";

import { TestSuiteRunStatusBadge } from "./TestSuiteRunStatusBadge";

interface TestSuiteRunsListProps {
  readonly suiteRuns: ReadonlyArray<TestSuiteRunSummaryDto>;
  readonly selectedTestSuiteRunId: string | null;
  readonly onSelect: (testSuiteRunId: string) => void;
}

/**
 * Suite runs list — left sidebar of the Tests tab. Reuses the same `formatRunListWhen` and
 * `formatRunListDurationLine` formatters as the Executions list so the two stay visually
 * consistent (e.g. "Today 14:32" vs raw ISO strings).
 *
 * Wording note: "X/Y test cases passed" is intentionally non-jargon. Phase 2 will let the
 * TestTrigger config supply a domain noun (e.g. "emails" / "invoices") so the row can read
 * "18/30 emails passed" — for now we use the generic "test cases" so readers without context
 * still understand what they're looking at.
 */
export function TestSuiteRunsList(props: TestSuiteRunsListProps) {
  if (props.suiteRuns.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        No test suite runs yet. Click <strong>Run tests</strong> to start the first one.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {props.suiteRuns.map((suite) => {
        const isSelected = suite.id === props.selectedTestSuiteRunId;
        const startedAtLabel = WorkflowDetailPresenter.formatRunListWhen(suite.startedAt);
        const durationLabel = WorkflowDetailPresenter.formatRunListDurationLine({
          startedAt: suite.startedAt,
          finishedAt: suite.finishedAt,
          // Map suite status onto the run status palette the formatter understands. `running`
          // / `pending` show the "still running" copy; everything else uses the duration.
          status: suite.status === "running" ? "running" : suite.status === "failed" ? "failed" : "completed",
        });
        return (
          <li key={suite.id}>
            <button
              type="button"
              data-testid={`test-suite-run-row-${suite.id}`}
              className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40 ${
                isSelected ? "bg-muted/60" : ""
              }`}
              onClick={() => props.onSelect(suite.id)}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-semibold">{suite.triggerNodeName ?? suite.triggerNodeId}</span>
                <TestSuiteRunStatusBadge status={suite.status} />
              </div>
              <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
                <span>{startedAtLabel}</span>
                <span>{durationLabel}</span>
                <span className="ml-auto">
                  {suite.passedCases}/{suite.totalCases} test {suite.totalCases === 1 ? "case" : "cases"} passed
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

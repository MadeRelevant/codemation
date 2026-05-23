import type { RunSummary } from "@codemation/canvas";

import { Badge } from "@codemation/ui";
import { cn } from "@codemation/ui";

import { WorkflowStatusIcon } from "./WorkflowDetailIcons";

/**
 * Resolves the status the executions list should show. For test-case runs the engine reports
 * `completed` even when assertions failed (the workflow itself didn't throw); the orchestrator
 * persists the corrected outcome onto `testCaseStatus`. Surface that here so failed test runs
 * don't hide as green checkmarks in the list. Returns the engine status verbatim for non-test
 * runs (no `testCaseStatus`).
 */
function resolveRunListDisplayedStatus(run: RunSummary): string {
  const tcs = run.testCaseStatus;
  if (tcs === undefined) return run.status;
  if (tcs === "succeeded") return "completed";
  if (tcs === "failed" || tcs === "errored" || tcs === "cancelled") return "failed";
  return tcs; // "running"
}

export function WorkflowRunsList(
  args: Readonly<{
    displayedRuns: ReadonlyArray<RunSummary> | undefined;
    runsError: string | null;
    selectedRunId: string | null;
    formatRunListWhen: (value: string | undefined) => string;
    formatRunListDurationLine: (run: Pick<RunSummary, "startedAt" | "finishedAt" | "status">) => string;
    getExecutionModeLabel: (run: Pick<RunSummary, "executionOptions"> | undefined) => string | null;
    onSelectRun: (runId: string) => void;
  }>,
) {
  const {
    displayedRuns,
    formatRunListDurationLine,
    formatRunListWhen,
    getExecutionModeLabel,
    onSelectRun,
    runsError,
    selectedRunId,
  } = args;

  if (runsError) return <p className="text-sm text-destructive">Failed to load executions: {runsError}</p>;
  if (!displayedRuns) return <p className="text-sm text-muted-foreground">Loading executions…</p>;
  if (displayedRuns.length === 0) return <p className="text-sm text-muted-foreground">No executions yet.</p>;

  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {displayedRuns.map((run) => {
        const whenLabel = formatRunListWhen(run.startedAt);
        const durationLine = formatRunListDurationLine(run);
        const modeLabel = getExecutionModeLabel(run);
        const selected = selectedRunId === run.runId;
        const displayedStatus = resolveRunListDisplayedStatus(run);
        return (
          <li key={run.runId}>
            <button
              type="button"
              data-testid={`run-summary-${run.runId}`}
              aria-label={`${displayedStatus}, ${whenLabel}`}
              onClick={() => onSelectRun(run.runId)}
              className={cn(
                "block w-full cursor-pointer border bg-card p-2.5 text-left font-inherit",
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              )}
            >
              <span className="visually-hidden" data-testid={`run-status-${run.runId}`}>
                {displayedStatus}
              </span>
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 pt-0.5">
                  <WorkflowStatusIcon status={displayedStatus} />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    data-testid={`run-started-label-${run.runId}`}
                    className="text-sm leading-tight font-bold break-words text-foreground"
                  >
                    {whenLabel}
                  </div>
                  <div
                    data-testid={`run-duration-line-${run.runId}`}
                    className="mt-1 text-xs leading-snug font-semibold text-muted-foreground"
                  >
                    {durationLine}
                  </div>
                </div>
                {modeLabel ? (
                  <Badge
                    variant="outline"
                    data-testid={`run-mode-${run.runId}`}
                    className="shrink-0 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase"
                  >
                    {modeLabel}
                  </Badge>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

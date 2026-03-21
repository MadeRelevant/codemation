import type { RunSummary } from "../../hooks/realtime/realtime";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { WorkflowStatusIcon } from "./WorkflowDetailIcons";

export function WorkflowRunsList(args: Readonly<{
  displayedRuns: ReadonlyArray<RunSummary> | undefined;
  runsError: string | null;
  selectedRunId: string | null;
  formatRunListWhen: (value: string | undefined) => string;
  formatRunListDurationLine: (run: Pick<RunSummary, "startedAt" | "finishedAt" | "status">) => string;
  getExecutionModeLabel: (run: Pick<RunSummary, "executionOptions"> | undefined) => string | null;
  onSelectRun: (runId: string) => void;
}>) {
  const { displayedRuns, formatRunListDurationLine, formatRunListWhen, getExecutionModeLabel, onSelectRun, runsError, selectedRunId } = args;

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
        return (
          <li key={run.runId}>
            <button
              type="button"
              data-testid={`run-summary-${run.runId}`}
              aria-label={`${run.status}, ${whenLabel}`}
              onClick={() => onSelectRun(run.runId)}
              className={cn(
                "block w-full cursor-pointer border bg-card p-2.5 text-left font-inherit",
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              )}
            >
              <span className="visually-hidden" data-testid={`run-status-${run.runId}`}>
                {run.status}
              </span>
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 pt-0.5">
                  <WorkflowStatusIcon status={run.status} />
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

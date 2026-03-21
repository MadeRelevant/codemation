import type { RunSummary } from "../../hooks/realtime/realtime";

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

  if (runsError) return <p style={{ color: "#b91c1c" }}>Failed to load executions: {runsError}</p>;
  if (!displayedRuns) return <p style={{ opacity: 0.7 }}>Loading executions…</p>;
  if (displayedRuns.length === 0) return <p style={{ opacity: 0.7 }}>No executions yet.</p>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {displayedRuns.map((run) => {
        const whenLabel = formatRunListWhen(run.startedAt);
        const durationLine = formatRunListDurationLine(run);
        const modeLabel = getExecutionModeLabel(run);
        return (
          <li key={run.runId}>
            <button
              type="button"
              data-testid={`run-summary-${run.runId}`}
              aria-label={`${run.status}, ${whenLabel}`}
              onClick={() => onSelectRun(run.runId)}
              style={{
                width: "100%",
                textAlign: "left",
                border: selectedRunId === run.runId ? "1px solid #2563eb" : "1px solid #d1d5db",
                padding: 10,
                cursor: "pointer",
                background: selectedRunId === run.runId ? "#eff6ff" : "white",
                display: "block",
                font: "inherit",
              }}
            >
              <span className="visually-hidden" data-testid={`run-status-${run.runId}`}>
                {run.status}
              </span>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: "0 0 auto", paddingTop: 2 }}>
                  <WorkflowStatusIcon status={run.status} />
                </div>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div
                    data-testid={`run-started-label-${run.runId}`}
                    style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.25, wordBreak: "break-word" }}
                  >
                    {whenLabel}
                  </div>
                  <div
                    data-testid={`run-duration-line-${run.runId}`}
                    style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: "#6b7280", lineHeight: 1.3 }}
                  >
                    {durationLine}
                  </div>
                </div>
                {modeLabel ? (
                  <span
                    data-testid={`run-mode-${run.runId}`}
                    style={{
                      flex: "0 0 auto",
                      border: "1px solid #d1d5db",
                      background: "#f8fafc",
                      color: "#334155",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.35,
                      textTransform: "uppercase",
                      padding: "3px 6px",
                      lineHeight: 1.2,
                    }}
                  >
                    {modeLabel}
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

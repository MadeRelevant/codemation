import type { RunSummary } from "../realtime/realtime";

import { WorkflowStatusIcon } from "./WorkflowDetailIcons";

export function WorkflowRunsList(args: Readonly<{
  displayedRuns: ReadonlyArray<RunSummary> | undefined;
  runsError: string | null;
  selectedRunId: string | null;
  formatDateTime: (value: string | undefined) => string;
  getExecutionModeLabel: (run: Pick<RunSummary, "executionOptions"> | undefined) => string | null;
  onSelectRun: (runId: string) => void;
}>) {
  const { displayedRuns, formatDateTime, getExecutionModeLabel, onSelectRun, runsError, selectedRunId } = args;

  if (runsError) return <p style={{ color: "#b91c1c" }}>Failed to load executions: {runsError}</p>;
  if (!displayedRuns) return <p style={{ opacity: 0.7 }}>Loading executions…</p>;
  if (displayedRuns.length === 0) return <p style={{ opacity: 0.7 }}>No executions yet.</p>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {displayedRuns.map((run) => (
        <li key={run.runId}>
          <button
            data-testid={`run-summary-${run.runId}`}
            onClick={() => onSelectRun(run.runId)}
            style={{
              width: "100%",
              textAlign: "left",
              border: selectedRunId === run.runId ? "1px solid #2563eb" : "1px solid #d1d5db",
              padding: 10,
              cursor: "pointer",
              background: selectedRunId === run.runId ? "#eff6ff" : "white",
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <WorkflowStatusIcon status={run.status} />
                <div data-testid={`run-status-${run.runId}`} style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {run.status}
                </div>
                {getExecutionModeLabel(run) ? (
                  <span
                    data-testid={`run-mode-${run.runId}`}
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#f8fafc",
                      color: "#334155",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      padding: "2px 6px",
                    }}
                  >
                    {getExecutionModeLabel(run)}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "nowrap" }}>{formatDateTime(run.startedAt)}</div>
            </div>
            <div
              data-testid={`run-id-${run.runId}`}
              style={{ fontSize: 12, opacity: 0.66, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {run.runId}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

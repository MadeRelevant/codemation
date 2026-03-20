import type { RunSummary } from "../realtime/realtime";
import { WorkflowStatusIcon } from "./WorkflowDetailIcons";
import type { WorkflowRunsSidebarActions,WorkflowRunsSidebarFormatting,WorkflowRunsSidebarModel } from "./workflowDetailTypes";

export function WorkflowRunsSidebar(args: Readonly<{
  model: WorkflowRunsSidebarModel;
  actions: WorkflowRunsSidebarActions;
  formatting: WorkflowRunsSidebarFormatting;
}>) {
  const { actions, formatting, model } = args;
  const { formatDateTime, getExecutionModeLabel } = formatting;
  const { onSelectRun } = actions;
  const { displayedRuns, displayedWorkflow, error, runsError, selectedRunId, workflow, workflowError, workflowId } = model;

  return (
    <aside
      data-testid="workflow-runs-sidebar"
      style={{ height: "100%", minHeight: 0, overflow: "hidden", borderRight: "1px solid #d1d5db", background: "#fff", display: "flex", flexDirection: "column", minWidth: 0 }}
    >
      <div style={{ padding: 14, borderBottom: "1px solid #d1d5db" }}>
        <a href="/workflows" style={{ opacity: 0.8, fontSize: 13, color: "#2563eb", textDecoration: "none" }}>
          ← Workflows
        </a>
        <div data-testid="workflow-title" style={{ marginTop: 10, fontSize: 16, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
          {displayedWorkflow?.name ?? workflow?.name ?? "Workflow"}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.68, wordBreak: "break-all" }}>{workflowId}</div>
        {error || workflowError ? <div style={{ marginTop: 10, fontSize: 13, color: "#b91c1c" }}>Error: {error ?? workflowError}</div> : null}
      </div>

      <div style={{ padding: 14, borderBottom: "1px solid #d1d5db", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.72 }}>Executions</div>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{displayedRuns?.length ?? "…"}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14 }}>
        <WorkflowRunsList
          displayedRuns={displayedRuns}
          formatDateTime={formatDateTime}
          getExecutionModeLabel={getExecutionModeLabel}
          onSelectRun={onSelectRun}
          runsError={runsError}
          selectedRunId={selectedRunId}
        />
      </div>
    </aside>
  );
}

function WorkflowRunsList(args: Readonly<{
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
                    style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#334155", fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", padding: "2px 6px" }}
                  >
                    {getExecutionModeLabel(run)}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "nowrap" }}>{formatDateTime(run.startedAt)}</div>
            </div>
            <div data-testid={`run-id-${run.runId}`} style={{ fontSize: 12, opacity: 0.66, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {run.runId}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

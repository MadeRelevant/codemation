import { Link } from "@tanstack/react-router";
import type { RunSummary } from "../realtime/realtime";
import { WorkflowStatusIcon } from "./WorkflowDetailIcons";
import type { WorkflowRunsSidebarActions, WorkflowRunsSidebarFormatting, WorkflowRunsSidebarModel } from "./workflowDetailTypes";

export function WorkflowRunsSidebar(args: Readonly<{
  model: WorkflowRunsSidebarModel;
  actions: WorkflowRunsSidebarActions;
  formatting: WorkflowRunsSidebarFormatting;
}>) {
  const { actions, formatting, model } = args;
  const { formatDateTime, getExecutionModeLabel } = formatting;
  const { onClearPin, onDebugHere, onDebugMutableExecution, onEditWorkflowSnapshot, onPinInput, onRun, onRunFromMutableExecution, onRunToHere, onSelectRun } = actions;
  const { displayedRuns, displayedWorkflow, error, isMutableSelectedRun, isRunning, runsError, selectedNodeId, selectedPinnedInput, selectedRun, selectedRunId, workflow, workflowError, workflowId } = model;

  return (
    <aside style={{ height: "100%", minHeight: 0, overflow: "hidden", borderRight: "1px solid #d1d5db", background: "#fff", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: 14, borderBottom: "1px solid #d1d5db" }}>
        <Link to="/workflows" style={{ opacity: 0.8, fontSize: 13, color: "#2563eb", textDecoration: "none" }}>
          ← Workflows
        </Link>
        <div data-testid="workflow-title" style={{ marginTop: 10, fontSize: 16, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
          {displayedWorkflow?.name ?? workflow?.name ?? "Workflow"}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.68, wordBreak: "break-all" }}>{workflowId}</div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <button
              onClick={onRun}
              disabled={isRunning}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #111827", background: "#111827", color: "white", fontWeight: 800, fontSize: 13, opacity: isRunning ? 0.8 : 1, cursor: isRunning ? "not-allowed" : "pointer" }}
            >
              {isRunning ? "Running…" : "Run workflow"}
            </button>
            <button
              onClick={onRunToHere}
              disabled={isRunning || !selectedNodeId}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", background: "white", color: "#111827", fontWeight: 800, fontSize: 13, opacity: isRunning || !selectedNodeId ? 0.6 : 1, cursor: isRunning || !selectedNodeId ? "not-allowed" : "pointer" }}
            >
              Run to here
            </button>
            <button
              onClick={onDebugHere}
              disabled={isRunning || !selectedNodeId}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", background: "#f8fafc", color: "#111827", fontWeight: 800, fontSize: 13, opacity: isRunning || !selectedNodeId ? 0.6 : 1, cursor: isRunning || !selectedNodeId ? "not-allowed" : "pointer" }}
            >
              Debug here
            </button>
          </div>
        </div>
        {selectedRun ? (
          <div style={{ marginTop: 12, padding: 10, border: "1px solid #e5e7eb", background: isMutableSelectedRun ? "#faf5ff" : "#f8fafc", display: "grid", gap: 8 }}>
            <div data-testid="execution-mode-label" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: "#475569" }}>
              {isMutableSelectedRun ? `${getExecutionModeLabel(selectedRun) ?? "Mutable"} execution` : "Immutable execution"}
            </div>
            <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
              {isMutableSelectedRun
                ? "Pins and workflow edits are saved on this execution. Running from a node creates a new derived execution."
                : "This execution is read-only. Use Run to here or Debug here to create a mutable execution from it."}
            </div>
            {isMutableSelectedRun ? (
              <div style={{ display: "grid", gap: 8 }}>
                <button
                  onClick={onRunFromMutableExecution}
                  disabled={isRunning || !selectedNodeId}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #111827", background: "#111827", color: "white", fontWeight: 800, fontSize: 12, opacity: isRunning || !selectedNodeId ? 0.6 : 1, cursor: isRunning || !selectedNodeId ? "not-allowed" : "pointer" }}
                >
                  Run from selected node
                </button>
                <button
                  data-testid="debug-selected-node-button"
                  onClick={onDebugMutableExecution}
                  disabled={isRunning || !selectedNodeId}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", background: "white", color: "#111827", fontWeight: 800, fontSize: 12, opacity: isRunning || !selectedNodeId ? 0.6 : 1, cursor: isRunning || !selectedNodeId ? "not-allowed" : "pointer" }}
                >
                  Debug selected node
                </button>
                <button
                  onClick={onPinInput}
                  disabled={!selectedNodeId}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", background: "white", color: "#111827", fontWeight: 800, fontSize: 12, opacity: !selectedNodeId ? 0.6 : 1, cursor: !selectedNodeId ? "not-allowed" : "pointer" }}
                >
                  Pin selected node input
                </button>
                <button
                  onClick={onClearPin}
                  disabled={!selectedNodeId || !selectedPinnedInput}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", background: "white", color: "#111827", fontWeight: 800, fontSize: 12, opacity: !selectedNodeId || !selectedPinnedInput ? 0.6 : 1, cursor: !selectedNodeId || !selectedPinnedInput ? "not-allowed" : "pointer" }}
                >
                  Clear pinned input
                </button>
                <button
                  data-testid="edit-workflow-json-button"
                  onClick={onEditWorkflowSnapshot}
                  disabled={!selectedRun.workflowSnapshot}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", background: "white", color: "#111827", fontWeight: 800, fontSize: 12, opacity: !selectedRun.workflowSnapshot ? 0.6 : 1, cursor: !selectedRun.workflowSnapshot ? "not-allowed" : "pointer" }}
                >
                  Edit workflow JSON
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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

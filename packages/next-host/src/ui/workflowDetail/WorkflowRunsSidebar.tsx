import type { WorkflowRunsSidebarActions, WorkflowRunsSidebarFormatting, WorkflowRunsSidebarModel } from "./workflowDetailTypes";

import { WorkflowRunsList } from "./WorkflowRunsList";

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
      style={{
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        borderRight: "1px solid #d1d5db",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div style={{ padding: 14, borderBottom: "1px solid #d1d5db" }}>
        <a href="/workflows" style={{ opacity: 0.8, fontSize: 13, color: "#2563eb", textDecoration: "none" }}>
          ← Workflows
        </a>
        <div
          data-testid="workflow-title"
          style={{ marginTop: 10, fontSize: 16, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}
        >
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

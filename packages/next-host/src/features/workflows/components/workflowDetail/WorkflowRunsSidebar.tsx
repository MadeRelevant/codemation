import Link from "next/link";

import type {
  WorkflowRunsSidebarActions,
  WorkflowRunsSidebarFormatting,
  WorkflowRunsSidebarModel,
} from "../../lib/workflowDetail/workflowDetailTypes";

import { WorkflowRunsList } from "./WorkflowRunsList";

export function WorkflowRunsSidebar(
  args: Readonly<{
    model: WorkflowRunsSidebarModel;
    actions: WorkflowRunsSidebarActions;
    formatting: WorkflowRunsSidebarFormatting;
  }>,
) {
  const { actions, formatting, model } = args;
  const { formatRunListDurationLine, formatRunListWhen, getExecutionModeLabel } = formatting;
  const { onSelectRun } = actions;
  const { displayedRuns, displayedWorkflow, error, runsError, selectedRunId, workflow, workflowError, workflowId } =
    model;

  return (
    <aside
      data-testid="workflow-runs-sidebar"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-card"
    >
      <div className="border-b border-border p-3.5">
        <Link href="/workflows" className="text-sm text-primary no-underline opacity-90 hover:underline">
          ← Workflows
        </Link>
        <div data-testid="workflow-title" className="mt-2.5 text-base leading-tight font-extrabold break-words">
          {displayedWorkflow?.name ?? workflow?.name ?? "Workflow"}
        </div>
        <div className="mt-1 break-all text-xs text-muted-foreground">{workflowId}</div>
        {error || workflowError ? (
          <div className="mt-2.5 text-sm text-destructive">Error: {error ?? workflowError}</div>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between border-b border-border p-3.5">
        <div className="text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Executions</div>
        <span className="text-xs text-muted-foreground">{displayedRuns?.length ?? "…"}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <WorkflowRunsList
          displayedRuns={displayedRuns}
          formatRunListDurationLine={formatRunListDurationLine}
          formatRunListWhen={formatRunListWhen}
          getExecutionModeLabel={getExecutionModeLabel}
          onSelectRun={onSelectRun}
          runsError={runsError}
          selectedRunId={selectedRunId}
        />
      </div>
    </aside>
  );
}

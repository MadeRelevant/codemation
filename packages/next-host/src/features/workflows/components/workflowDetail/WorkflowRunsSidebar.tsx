import { cn } from "@/lib/utils";

import type {
  WorkflowRunsSidebarActions,
  WorkflowRunsSidebarFormatting,
  WorkflowRunsSidebarModel,
} from "../../lib/workflowDetail/workflowDetailTypes";

import { WorkflowRunsList } from "./WorkflowRunsList";

/**
 * Left drawer over the canvas (see WorkflowDetailScreen). Open/close is driven by Live workflow / Executions tabs.
 */
export function WorkflowRunsSidebar(
  args: Readonly<{
    isOpen: boolean;
    model: WorkflowRunsSidebarModel;
    actions: WorkflowRunsSidebarActions;
    formatting: WorkflowRunsSidebarFormatting;
  }>,
) {
  const { actions, formatting, isOpen, model } = args;
  const { formatRunListDurationLine, formatRunListWhen, getExecutionModeLabel } = formatting;
  const { onSelectRun } = actions;
  const { displayedRuns, error, runsError, selectedRunId, workflowError } = model;

  return (
    <aside
      data-testid="workflow-runs-sidebar"
      className={cn(
        "absolute top-0 bottom-0 left-0 z-[7] flex min-h-0 w-[320px] flex-col overflow-hidden border-r bg-card shadow-[6px_0_18px_rgba(15,23,42,0.06)] transition-transform duration-200 ease-out",
        isOpen ? "translate-x-0 border-border" : "pointer-events-none -translate-x-full border-transparent",
      )}
    >
      {error || workflowError ? (
        <div className="shrink-0 border-b border-border px-3.5 py-2.5 text-sm text-destructive">
          {error ?? workflowError}
        </div>
      ) : null}

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

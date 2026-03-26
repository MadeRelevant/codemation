import type {
  WorkflowRunsSidebarActions,
  WorkflowRunsSidebarFormatting,
  WorkflowRunsSidebarModel,
} from "../../lib/workflowDetail/workflowDetailTypes";

import { WorkflowRunsList } from "./WorkflowRunsList";

/**
 * Left column when the executions pane is open (see WorkflowDetailScreen grid). Must stay in document flow so
 * `grid-cols-[320px_1fr]` reserves space; `position:absolute` would anchor to the wrong containing block and
 * collapse the canvas column.
 */
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
  const { displayedRuns, error, runsError, selectedRunId, workflowError } = model;

  return (
    <aside
      data-testid="workflow-runs-sidebar"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border bg-card shadow-[6px_0_18px_rgba(15,23,42,0.06)]"
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

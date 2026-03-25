import type { WorkflowSummary } from "../hooks/realtime/realtime";

import { WorkflowsListTree } from "../components/WorkflowsListTree";

export function WorkflowsList(
  args: Readonly<{ workflows: ReadonlyArray<WorkflowSummary> | undefined; error: string | null }>,
) {
  const { workflows, error } = args;

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="workflows-load-error">
        Failed to load workflows: {error}
      </p>
    );
  }

  if (!workflows) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="workflows-loading">
        Loading workflows…
      </p>
    );
  }

  if (workflows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="workflows-empty">
        No workflows found.
      </p>
    );
  }

  return <WorkflowsListTree workflows={workflows} />;
}

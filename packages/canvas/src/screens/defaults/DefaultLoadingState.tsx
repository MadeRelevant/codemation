"use client";

/**
 * Default loading state slot — renders the "Loading diagram…" placeholder shown
 * while displayedWorkflow is null, exactly as WorkflowDetailScreen does today.
 */
export function DefaultLoadingState() {
  return <div className="p-4 text-sm text-muted-foreground">Loading diagram…</div>;
}

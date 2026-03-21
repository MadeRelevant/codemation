"use client";

import type { WorkflowSummary } from "../hooks/realtime/realtime";

import { useWorkflowsQueryWithInitialData } from "../hooks/realtime/realtime";

import { WorkflowsList } from "./WorkflowsList";

export function WorkflowsScreen(args: Readonly<{ initialWorkflows?: ReadonlyArray<WorkflowSummary> }>) {
  const { initialWorkflows } = args;
  const workflowsQuery = useWorkflowsQueryWithInitialData(initialWorkflows);
  const workflows = workflowsQuery.data;
  const error = workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null;

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Codemation</div>
          <h1 className="mb-0 mt-2 text-3xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-2 text-sm text-muted-foreground">Framework-managed workflows using the shared Codemation runtime.</p>
        </div>
      </header>
      <section className="mt-6">
        <WorkflowsList workflows={workflows} error={error} />
      </section>
    </main>
  );
}

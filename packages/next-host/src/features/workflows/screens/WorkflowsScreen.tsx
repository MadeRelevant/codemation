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
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.66 }}>Codemation</div>
          <h1 style={{ margin: "8px 0 0", fontSize: 30 }}>Workflows</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.78 }}>Framework-managed workflows using the shared Codemation runtime.</p>
        </div>
      </header>
      <section style={{ marginTop: 24 }}>
        <WorkflowsList workflows={workflows} error={error} />
      </section>
    </main>
  );
}

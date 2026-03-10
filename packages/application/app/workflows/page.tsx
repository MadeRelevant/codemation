"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useWorkflowsQuery } from "../_realtime/realtime";

export default function WorkflowsPage() {
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data;
  const error = workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null;

  const body = useMemo(() => {
    if (error) return <p style={{ color: "#b91c1c" }}>Failed to load workflows: {error}</p>;
    if (!workflows) return <p style={{ opacity: 0.8 }}>Loading workflows…</p>;
    if (workflows.length === 0) return <p style={{ opacity: 0.8 }}>No workflows found.</p>;
    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
        {workflows.map((wf) => (
          <li key={wf.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, opacity: 0.7 }}>{wf.id}</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{wf.name}</div>
              </div>
              <Link href={`/workflows/${encodeURIComponent(wf.id)}`} style={{ fontWeight: 600 }}>
                Open →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    );
  }, [workflows, error]);

  return (
    <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Workflows</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Consumer-mode dev UI</p>
        </div>
      </header>
      <section style={{ marginTop: 20 }}>{body}</section>
    </main>
  );
}


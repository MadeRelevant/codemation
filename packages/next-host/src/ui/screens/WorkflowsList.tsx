import type { WorkflowSummary } from "../realtime/realtime";

export function WorkflowsList(args: Readonly<{ workflows: ReadonlyArray<WorkflowSummary> | undefined; error: string | null }>) {
  const { workflows, error } = args;

  if (error) {
    return <p style={{ color: "#b91c1c" }}>Failed to load workflows: {error}</p>;
  }

  if (!workflows) {
    return <p style={{ opacity: 0.72 }}>Loading workflows…</p>;
  }

  if (workflows.length === 0) {
    return <p style={{ opacity: 0.72 }}>No workflows found.</p>;
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
      {workflows.map((workflow) => (
        <li key={workflow.id} style={{ background: "#fff", border: "1px solid #d1d5db", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.66 }}>{workflow.id}</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>{workflow.name}</div>
            </div>
            <a
              href={`/workflows/${encodeURIComponent(workflow.id)}`}
              style={{ fontWeight: 700, color: "#2563eb", textDecoration: "none" }}
            >
              Open
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

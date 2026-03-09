"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { WorkflowCanvas } from "./WorkflowCanvas";

type WorkflowDto = Readonly<{
  id: string;
  name: string;
  nodes: ReadonlyArray<Readonly<{ id: string; kind: string; name?: string; type: string }>>;
  edges: ReadonlyArray<
    Readonly<{
      from: Readonly<{ nodeId: string; output: string }>;
      to: Readonly<{ nodeId: string; input: string }>;
    }>
  >;
}>;

type RunSummary = Readonly<{ runId: string; workflowId: string; startedAt: string; status: string }>;

async function fetchWorkflow(workflowId: string): Promise<WorkflowDto> {
  const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as WorkflowDto;
}

async function fetchRuns(workflowId: string): Promise<RunSummary[]> {
  const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/runs`, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as RunSummary[];
}

async function runWorkflow(workflowId: string): Promise<void> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId, items: [{ json: {} }] }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export default function WorkflowDetailPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId: rawWorkflowId } = use(params);
  const workflowId = decodeURIComponent(rawWorkflowId);

  const [workflow, setWorkflow] = useState<WorkflowDto | null>(null);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const reload = useCallback(() => {
    setError(null);
    setWorkflow(null);
    setRuns(null);
    void Promise.all([fetchWorkflow(workflowId), fetchRuns(workflowId)])
      .then(([wf, rs]) => {
        setWorkflow(wf);
        setRuns(rs);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setWorkflow(null);
        setRuns([]);
      });
  }, [workflowId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onRun = useCallback(() => {
    setIsRunning(true);
    setError(null);
    void runWorkflow(workflowId)
      .then(async () => {
        const rs = await fetchRuns(workflowId);
        setRuns(rs);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsRunning(false));
  }, [workflowId]);

  const runsSection = useMemo(() => {
    if (runs === null) return <p style={{ opacity: 0.8 }}>Loading executions…</p>;
    if (runs.length === 0) return <p style={{ opacity: 0.8 }}>No executions yet.</p>;
    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {runs.map((r) => (
          <li key={r.runId} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{new Date(r.startedAt).toLocaleString()}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.status}</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{r.runId}</div>
              </div>
              <Link href={`/runs/${encodeURIComponent(r.runId)}`} style={{ fontWeight: 600 }}>
                Open →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    );
  }, [runs]);

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <section style={{ height: "100%", width: "100%", display: "grid", gridTemplateColumns: "minmax(320px, 10%) 1fr" }}>
        <aside
          style={{
            height: "100%",
            borderRight: "1px solid #e5e7eb",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
            <Link href="/workflows" style={{ opacity: 0.8 }}>
              ← Workflows
            </Link>
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
              {workflow?.name ?? "Workflow"}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7, wordBreak: "break-all" }}>{workflowId}</div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <button
                onClick={onRun}
                disabled={isRunning}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
                  fontWeight: 800,
                  opacity: isRunning ? 0.8 : 1,
                  cursor: isRunning ? "not-allowed" : "pointer",
                }}
              >
                {isRunning ? "Running…" : "Run workflow"}
              </button>
              <button
                onClick={reload}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", fontWeight: 700 }}
              >
                Refresh
              </button>
            </div>

            {error ? <div style={{ marginTop: 10, fontSize: 13, color: "#b91c1c" }}>Error: {error}</div> : null}
          </div>

          <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Executions</div>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{runs?.length ?? "…"}</span>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 14 }}>{runsSection}</div>
        </aside>

        <div style={{ height: "100%", minWidth: 0, background: "#fbfbfc" }}>
          <div style={{ height: "100%", width: "100%" }}>
            {workflow ? <WorkflowCanvas workflow={workflow} /> : <div style={{ padding: 16, opacity: 0.8 }}>Loading diagram…</div>}
          </div>
        </div>
      </section>
    </main>
  );
}


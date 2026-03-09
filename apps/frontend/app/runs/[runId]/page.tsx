"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

type PersistedRunState = Readonly<{
  runId: string;
  workflowId: string;
  startedAt: string;
  status: string;
  pending?: unknown;
  queue: unknown[];
  outputsByNode: Record<string, unknown>;
  parent?: unknown;
}>;

async function fetchRun(runId: string): Promise<PersistedRunState> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as PersistedRunState;
}

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId: rawRunId } = use(params);
  const runId = decodeURIComponent(rawRunId);
  const [state, setState] = useState<PersistedRunState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    void fetchRun(runId)
      .then((s) => {
        if (cancelled) return;
        setState(s);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const summary = useMemo(() => {
    if (!state) return null;
    const outputsNodes = Object.keys(state.outputsByNode ?? {}).length;
    return { outputsNodes };
  }, [state]);

  return (
    <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <header>
        <Link href={state ? `/workflows/${encodeURIComponent(state.workflowId)}` : "/workflows"} style={{ opacity: 0.8 }}>
          ← Back
        </Link>
        <h1 style={{ margin: "10px 0 0", fontSize: 28 }}>Execution</h1>
        <div style={{ fontSize: 14, opacity: 0.7, wordBreak: "break-all" }}>{runId}</div>
      </header>

      {error ? <p style={{ marginTop: 16, color: "#b91c1c" }}>Error: {error}</p> : null}

      {!state && !error ? <p style={{ marginTop: 16, opacity: 0.8 }}>Loading…</p> : null}

      {state ? (
        <section style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 8, columnGap: 10 }}>
              <div style={{ opacity: 0.7 }}>Workflow</div>
              <div style={{ wordBreak: "break-all" }}>{state.workflowId}</div>
              <div style={{ opacity: 0.7 }}>Started</div>
              <div>{new Date(state.startedAt).toLocaleString()}</div>
              <div style={{ opacity: 0.7 }}>Status</div>
              <div style={{ fontWeight: 700 }}>{state.status}</div>
              <div style={{ opacity: 0.7 }}>Outputs nodes</div>
              <div>{summary?.outputsNodes ?? 0}</div>
              <div style={{ opacity: 0.7 }}>Queue entries</div>
              <div>{state.queue.length}</div>
            </div>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, overflowX: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Raw state</div>
            <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(state, null, 2)}</pre>
          </div>
        </section>
      ) : null}
    </main>
  );
}


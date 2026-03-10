"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useRunQuery, useWorkflowRealtimeSubscription } from "../../_realtime/realtime";

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId: rawRunId } = use(params);
  const runId = decodeURIComponent(rawRunId);
  const runQuery = useRunQuery(runId);
  const state = runQuery.data;
  const error = runQuery.error instanceof Error ? runQuery.error.message : null;

  useWorkflowRealtimeSubscription(state?.workflowId);

  const summary = useMemo(() => {
    if (!state) return null;
    const outputsNodes = Object.keys(state.outputsByNode ?? {}).length;
    const trackedNodes = Object.keys(state.nodeSnapshotsByNodeId ?? {}).length;
    return { outputsNodes, trackedNodes };
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
              <div style={{ opacity: 0.7 }}>Tracked nodes</div>
              <div>{summary?.trackedNodes ?? 0}</div>
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


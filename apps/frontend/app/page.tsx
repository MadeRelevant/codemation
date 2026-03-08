async function getWorkflows() {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const res = await fetch(`${base}/api/workflows`, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as Array<{ id: string; name: string }>;
}

export default async function Page() {
  const workflows = await getWorkflows();
  return (
    <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>Codemation (dev)</h1>
      <p>Workflows from engine host:</p>
      <pre style={{ background: "#111", color: "#eee", padding: 16, borderRadius: 8, overflowX: "auto" }}>
        {JSON.stringify(workflows, null, 2)}
      </pre>
    </main>
  );
}


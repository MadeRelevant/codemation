"use client";

import type { TestAssertionDto } from "@codemation/host/dto";

import { TestAssertionRow } from "./TestAssertionRow";

interface TestAssertionsListProps {
  readonly assertions: ReadonlyArray<TestAssertionDto>;
  readonly groupByRun?: boolean;
}

export function TestAssertionsList(props: TestAssertionsListProps) {
  if (props.assertions.length === 0) {
    return <div className="px-4 py-6 text-sm text-muted-foreground">No assertions emitted.</div>;
  }
  if (!props.groupByRun) {
    return (
      <ul className="divide-y divide-border">
        {props.assertions.map((a) => (
          <TestAssertionRow key={a.id} assertion={a} />
        ))}
      </ul>
    );
  }
  const byRun = new Map<string, TestAssertionDto[]>();
  for (const a of props.assertions) {
    const list = byRun.get(a.runId) ?? [];
    list.push(a);
    byRun.set(a.runId, list);
  }
  return (
    <div className="divide-y divide-border">
      {[...byRun.entries()].map(([runId, runAssertions]) => (
        <div key={runId} className="px-4 py-3">
          <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">run: {runId.slice(0, 12)}…</span>
            <span>
              {runAssertions.filter((a) => a.status === "pass").length}/{runAssertions.length} passed
            </span>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {runAssertions.map((a) => (
              <TestAssertionRow key={a.id} assertion={a} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

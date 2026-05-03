"use client";

import type { TestAssertionDto } from "@codemation/host/dto";

const STATUS_BADGE: Readonly<Record<TestAssertionDto["status"], string>> = {
  pass: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
  fail: "bg-red-100 text-red-900 dark:bg-red-950/30 dark:text-red-200",
  error: "bg-purple-100 text-purple-900 dark:bg-purple-950/30 dark:text-purple-200",
};

function formatJsonValue(value: unknown): string {
  if (value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function TestAssertionRow(props: Readonly<{ assertion: TestAssertionDto }>) {
  const a = props.assertion;
  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-sm" data-testid={`test-assertion-row-${a.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{a.name}</span>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${
            STATUS_BADGE[a.status] ?? "bg-zinc-100 text-zinc-900"
          }`}
        >
          {a.status}
          {a.score !== undefined ? ` · ${a.score.toFixed(2)}` : ""}
        </span>
      </div>
      {a.message ? <div className="text-xs text-muted-foreground">{a.message}</div> : null}
      {a.expected !== undefined || a.actual !== undefined ? (
        <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">expected</div>
            <pre className="overflow-x-auto rounded bg-muted/40 px-2 py-1">{formatJsonValue(a.expected)}</pre>
          </div>
          <div>
            <div className="text-muted-foreground">actual</div>
            <pre className="overflow-x-auto rounded bg-muted/40 px-2 py-1">{formatJsonValue(a.actual)}</pre>
          </div>
        </div>
      ) : null}
    </li>
  );
}

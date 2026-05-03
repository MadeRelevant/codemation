"use client";

import type { TestSuiteRunSummaryDto } from "@codemation/host/dto";

const STATUS_STYLES: Readonly<Record<TestSuiteRunSummaryDto["status"], string>> = {
  running: "bg-blue-100 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200",
  succeeded: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
  partial: "bg-amber-100 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
  failed: "bg-red-100 text-red-900 dark:bg-red-950/30 dark:text-red-200",
  cancelled: "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-200",
  errored: "bg-purple-100 text-purple-900 dark:bg-purple-950/30 dark:text-purple-200",
};

export function TestSuiteRunStatusBadge(props: Readonly<{ status: TestSuiteRunSummaryDto["status"] }>) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${
        STATUS_STYLES[props.status] ?? "bg-zinc-100 text-zinc-900"
      }`}
    >
      {props.status}
    </span>
  );
}

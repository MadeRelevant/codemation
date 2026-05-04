"use client";

import type { TestSuiteChildRunDto } from "@codemation/host/dto";
import AlertCircle from "lucide-react/dist/esm/icons/alert-circle";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import CircleSlash from "lucide-react/dist/esm/icons/circle-slash";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import XCircle from "lucide-react/dist/esm/icons/x-circle";

/**
 * Display status for one test case. Prefer `testCaseStatus` (the assertion-rollup-corrected
 * status the tracker maintains) over the engine `status`, since the engine reports
 * `completed` even for cases whose assertions failed.
 *
 * Resolution priority: explicit `testCaseStatus` → mapped engine `status` → "queued" fallback.
 * Mapping engine → case status is best-effort: `pending`/`running` map straight through;
 * `completed` and `failed` are surfaced as-is when no rollup-corrected value is available
 * (e.g. legacy persisted rows from before the engine-side init landed).
 */
export type DisplayedCaseStatus = "queued" | "running" | "succeeded" | "failed" | "errored" | "cancelled" | "completed";

export function resolveDisplayedCaseStatus(run: TestSuiteChildRunDto): DisplayedCaseStatus {
  if (run.testCaseStatus !== undefined) return run.testCaseStatus;
  switch (run.status) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "completed":
      // No rollup info — treat engine "completed" as "completed" (display-only fallback).
      // This branch is hit only for legacy rows pre-dating the engine-side testCaseStatus init.
      return "completed";
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

export function TestSuiteCaseStatusIcon(props: Readonly<{ status: DisplayedCaseStatus; className?: string }>) {
  const { status, className } = props;
  const cls = className ?? "size-4";
  switch (status) {
    case "queued":
      return <CircleDashed className={`${cls} text-muted-foreground`} aria-label="queued" />;
    case "running":
      return <Loader2 className={`${cls} animate-spin text-blue-600`} aria-label="running" />;
    case "succeeded":
    case "completed":
      return <CheckCircle2 className={`${cls} text-emerald-600`} aria-label={status} />;
    case "failed":
      return <XCircle className={`${cls} text-red-600`} aria-label="failed" />;
    case "errored":
      return <AlertCircle className={`${cls} text-purple-700`} aria-label="errored" />;
    case "cancelled":
      return <CircleSlash className={`${cls} text-muted-foreground`} aria-label="cancelled" />;
    default:
      return <CircleDashed className={`${cls} text-muted-foreground`} aria-label="unknown" />;
  }
}

const STATUS_LABEL: Readonly<Record<DisplayedCaseStatus, string>> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  completed: "Completed",
  failed: "Failed",
  errored: "Errored",
  cancelled: "Cancelled",
};

export function statusLabelFor(status: DisplayedCaseStatus): string {
  return STATUS_LABEL[status] ?? status;
}

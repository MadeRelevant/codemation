"use client";

import type { TestSuiteChildRunDto } from "@codemation/host/dto";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import XCircle from "lucide-react/dist/esm/icons/x-circle";

/**
 * One icon per run status. Visually distinct + colorblind-safe enough that the test-case
 * tree row's state is readable at a glance:
 *   - **queued / pending**: dashed circle (the run hasn't started yet)
 *   - **running**: spinning loader
 *   - **completed**: solid check (green)
 *   - **failed**: X circle (red)
 *
 * Mapped from `RunStatus` (engine type), which only has 4 values today; we use `pending` as
 * a stand-in for "queued" since the engine doesn't distinguish them on the wire.
 */
export function TestSuiteCaseStatusIcon(
  props: Readonly<{ status: TestSuiteChildRunDto["status"]; className?: string }>,
) {
  const { status, className } = props;
  const cls = className ?? "size-4";
  switch (status) {
    case "pending":
      return <CircleDashed className={`${cls} text-muted-foreground`} aria-label="queued" />;
    case "running":
      return <Loader2 className={`${cls} animate-spin text-blue-600`} aria-label="running" />;
    case "completed":
      return <CheckCircle2 className={`${cls} text-emerald-600`} aria-label="completed" />;
    case "failed":
      return <XCircle className={`${cls} text-red-600`} aria-label="failed" />;
    default:
      return <CircleDashed className={`${cls} text-muted-foreground`} aria-label="unknown" />;
  }
}

const STATUS_LABEL: Readonly<Record<TestSuiteChildRunDto["status"], string>> = {
  pending: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export function statusLabelFor(status: TestSuiteChildRunDto["status"]): string {
  return STATUS_LABEL[status] ?? status;
}

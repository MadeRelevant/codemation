type RealtimeBadgeState = Readonly<{
  kind: "ok" | "errored" | "disconnected" | "reloading";
  message?: string;
  file?: string;
  line?: number;
  column?: number;
}>;

export type WorkflowRealtimeBadgeViewModel = Readonly<{
  className: string;
  label: string;
  testId: string;
}>;

export function resolveWorkflowRealtimeBadge(badgeState: RealtimeBadgeState): WorkflowRealtimeBadgeViewModel | null {
  if (badgeState.kind === "errored") {
    return {
      className: "border-destructive/40 bg-destructive/10 text-destructive shadow-md ring-1 ring-foreground/10",
      label:
        `Build failed: ${badgeState.file ? `${badgeState.file}:${badgeState.line ?? "?"}` : ""} — ${badgeState.message}`.trim(),
      testId: "workflow-realtime-build-failed-indicator",
    };
  }
  if (badgeState.kind === "disconnected") {
    return {
      className:
        "border-amber-400/60 bg-amber-50 text-amber-950 shadow-md ring-1 ring-foreground/10 dark:bg-amber-950/20 dark:text-amber-100",
      label: "Realtime disconnected. Workflow edits won't auto-refresh.",
      testId: "workflow-realtime-disconnected-indicator",
    };
  }
  if (badgeState.kind === "reloading") {
    return {
      className: "border-primary/40 bg-primary/10 text-primary shadow-md ring-1 ring-foreground/10",
      label: "Reloading workflows...",
      testId: "workflow-realtime-reloading-indicator",
    };
  }
  return null;
}

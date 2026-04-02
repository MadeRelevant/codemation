"use client";

import type { ReactElement } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import type { WorkflowDevBuildState } from "../lib/realtime/realtimeDomainTypes";

type RealtimeBadge = Readonly<{
  className: string;
  label: string;
  testId: string;
  showSpinner: boolean;
}>;

export function WorkflowDetailScreenRealtimeBanner(
  args: Readonly<{
    workflowDevBuildState: WorkflowDevBuildState;
    showRealtimeConnectedBanner: boolean;
    showRealtimeDisconnectedBadge: boolean;
    isLiveWorkflowView: boolean;
    isRunsPaneVisible: boolean;
    isPropertiesPanelOpen: boolean;
    hasSelectedPropertiesNode: boolean;
    propertiesPanelWidthPx: number;
  }>,
): ReactElement | null {
  const shouldShowRealtimeBadge = args.isLiveWorkflowView && !args.isRunsPaneVisible;
  const realtimeBadge: RealtimeBadge | null =
    args.workflowDevBuildState.state === "failed"
      ? {
          className: "border-destructive/40 bg-destructive/10 text-destructive shadow-md ring-1 ring-foreground/10",
          label: "Rebuild failed. Latest code is not live yet.",
          testId: "workflow-dev-build-failed-indicator",
          showSpinner: false,
        }
      : args.workflowDevBuildState.state === "building"
        ? {
            className: "border-primary/40 bg-primary/10 text-primary shadow-md ring-1 ring-foreground/10",
            label: "Rebuilding workflow...",
            testId: "workflow-dev-build-started-indicator",
            showSpinner: true,
          }
        : args.showRealtimeConnectedBanner
          ? {
              className:
                "border-emerald-500/40 bg-emerald-50 text-emerald-950 shadow-md ring-1 ring-foreground/10 dark:bg-emerald-950/25 dark:text-emerald-100",
              label: "Realtime connected.",
              testId: "workflow-realtime-connected-indicator",
              showSpinner: false,
            }
          : args.showRealtimeDisconnectedBadge
            ? {
                className:
                  "border-amber-400/60 bg-amber-50 text-amber-950 shadow-md ring-1 ring-foreground/10 dark:bg-amber-950/20 dark:text-amber-100",
                label: "Realtime disconnected. Workflow edits won't auto-refresh.",
                testId: "workflow-realtime-disconnected-indicator",
                showSpinner: false,
              }
            : null;

  const shouldOffsetRealtimeBadgeForPropertiesPanel = args.isPropertiesPanelOpen && args.hasSelectedPropertiesNode;

  if (!shouldShowRealtimeBadge || !realtimeBadge) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute top-3 z-[10] flex max-w-[min(22rem,calc(100%-1.5rem))] flex-col items-end gap-2"
      style={{
        right: shouldOffsetRealtimeBadgeForPropertiesPanel
          ? `calc(0.75rem + ${args.propertiesPanelWidthPx}px)`
          : "0.75rem",
      }}
    >
      <div
        data-testid={realtimeBadge.testId}
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-bold",
          realtimeBadge.className,
        )}
      >
        {realtimeBadge.showSpinner ? (
          <Loader2
            className="size-3.5 shrink-0 animate-spin"
            aria-hidden
            data-testid="workflow-dev-build-reload-spinner"
          />
        ) : null}
        <span>{realtimeBadge.label}</span>
      </div>
    </div>
  );
}

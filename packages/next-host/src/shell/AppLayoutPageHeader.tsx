"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";
import { useRef } from "react";

import AlertCircle from "lucide-react/dist/esm/icons/alert-circle";

import {
  CanvasNodeChromeTooltip,
  WorkflowActivationErrorDialog,
  WorkflowActivationHeaderControl,
} from "@codemation/canvas";
import { useWhitelabel } from "../providers/WhitelabelProvider";
import { getPageTitle } from "./appLayoutPageTitle";
import { AppShellHeaderActions } from "./AppShellHeaderActions";
import { useWorkflowDetailChrome } from "./WorkflowDetailChromeContext";
import type { WorkflowDetailChromeState } from "./WorkflowDetailChromeContext";
import { useWorkflowsQuery, useWorkflowQuery } from "@codemation/canvas";
import { WorkflowInfoPopover } from "./WorkflowInfoPopover";

export function AppLayoutPageHeader(): ReactNode {
  const pathname = usePathname();
  const { productName } = useWhitelabel();
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data ?? [];
  const title = getPageTitle(pathname, workflows, productName);
  const chrome = useWorkflowDetailChrome();
  const isWorkflowDetail = /^\/workflows\/[^/]+$/.test(pathname);
  const showChromeRow = isWorkflowDetail && chrome !== null;
  const workflowDetailMatch = pathname.match(/^\/workflows\/([^/]+)/);
  const currentWorkflowId = workflowDetailMatch ? decodeURIComponent(workflowDetailMatch[1]) : null;
  const currentWorkflowSummary = currentWorkflowId ? workflows.find((w) => w.id === currentWorkflowId) : undefined;
  // Reads from query cache; the workflow detail page always warms this key.
  const workflowDetailQuery = useWorkflowQuery(currentWorkflowId ?? "");
  const workflowDetailDto = workflowDetailQuery.data;
  const triggerNode = workflowDetailDto?.nodes.find((n) => n.kind === "trigger");
  const triggerType = triggerNode?.type ?? triggerNode?.name;
  const credentialLines = chrome?.credentialAttentionSummaryLines ?? [];
  const activationAlertLines = chrome?.workflowActivationAlertLines ?? null;

  // Keep the last live-view chrome state so the activation toggle stays mounted
  // during transient null resets (e.g. WorkflowDetailScreen unmount/remount).
  // When chrome is temporarily null the toggle renders as disabled-pending so
  // it visually persists rather than flickering out.
  const lastLiveChromeRef = useRef<WorkflowDetailChromeState | null>(null);
  if (chrome?.isLiveWorkflowView) {
    lastLiveChromeRef.current = chrome;
  } else if (!isWorkflowDetail) {
    lastLiveChromeRef.current = null;
  }
  const liveChrome = chrome?.isLiveWorkflowView ? chrome : lastLiveChromeRef.current;

  return (
    <header className="flex shrink-0 flex-col border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between gap-6 px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1
            className="m-0 min-w-0 truncate text-xl font-semibold leading-none text-foreground"
            data-testid={isWorkflowDetail ? "workflow-detail-workflow-title" : undefined}
          >
            {title}
          </h1>
          {isWorkflowDetail && currentWorkflowSummary ? (
            <WorkflowInfoPopover workflow={currentWorkflowSummary} triggerType={triggerType} />
          ) : null}
          {showChromeRow && credentialLines.length > 0 ? (
            <CanvasNodeChromeTooltip
              testId="workflow-credential-attention-indicator"
              ariaLabel="Workflow credential issues"
              tooltip={credentialLines.join("\n")}
            >
              <span
                data-testid="workflow-credential-attention-icon"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-900 shadow-sm"
              >
                <AlertCircle size={16} strokeWidth={2.2} />
              </span>
            </CanvasNodeChromeTooltip>
          ) : null}
          {isWorkflowDetail && liveChrome ? (
            <WorkflowActivationHeaderControl
              variant="shell"
              showErrorAlert={false}
              active={liveChrome.workflowIsActive}
              pending={liveChrome.isWorkflowActivationPending || chrome === null}
              onActiveChange={liveChrome.setWorkflowActive}
              alertLines={liveChrome.workflowActivationAlertLines}
              onDismissAlert={liveChrome.dismissWorkflowActivationAlert}
            />
          ) : null}
        </div>
        <AppShellHeaderActions />
      </div>
      {showChromeRow && chrome && activationAlertLines && activationAlertLines.length > 0 ? (
        <div data-testid="workflow-activation-shell-error">
          <WorkflowActivationErrorDialog
            open
            alertLines={activationAlertLines}
            onDismiss={chrome.dismissWorkflowActivationAlert}
          />
        </div>
      ) : null}
    </header>
  );
}

"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

import { AlertCircle } from "lucide-react";

import { CanvasNodeChromeTooltip } from "../features/workflows/components/canvas/CanvasNodeChromeTooltip";
import { WorkflowActivationErrorDialog } from "../features/workflows/components/workflowDetail/WorkflowActivationErrorDialog";
import { WorkflowActivationHeaderControl } from "../features/workflows/components/workflowDetail/WorkflowActivationHeaderControl";
import { useWhitelabel } from "../providers/WhitelabelProvider";
import { getPageTitle } from "./appLayoutPageTitle";
import { AppShellHeaderActions } from "./AppShellHeaderActions";
import { useWorkflowDetailChrome } from "./WorkflowDetailChromeContext";
import { useWorkflowsQuery } from "../features/workflows/hooks/realtime/realtime";

export function AppLayoutPageHeader(): ReactNode {
  const pathname = usePathname();
  const { productName } = useWhitelabel();
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data ?? [];
  const title = getPageTitle(pathname, workflows, productName);
  const chrome = useWorkflowDetailChrome();
  const isWorkflowDetail = /^\/workflows\/[^/]+$/.test(pathname);
  const showChromeRow = isWorkflowDetail && chrome !== null;
  const credentialLines = chrome?.credentialAttentionSummaryLines ?? [];
  const activationAlertLines = chrome?.workflowActivationAlertLines ?? null;

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
          {showChromeRow && chrome?.isLiveWorkflowView ? (
            <WorkflowActivationHeaderControl
              variant="shell"
              showErrorAlert={false}
              active={chrome.workflowIsActive}
              pending={chrome.isWorkflowActivationPending}
              onActiveChange={chrome.setWorkflowActive}
              alertLines={chrome.workflowActivationAlertLines}
              onDismissAlert={chrome.dismissWorkflowActivationAlert}
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

"use client";

import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WorkflowCanvas } from "../components/canvas/WorkflowCanvas";
import type { WorkflowDto } from "../hooks/realtime/realtime";
import { NodePropertiesSlidePanel } from "../components/workflowDetail/NodePropertiesSlidePanel";
import { useWorkflowDetailController } from "../hooks/workflowDetail/useWorkflowDetailController";
import { WorkflowJsonEditorDialog } from "../components/workflowDetail/WorkflowJsonEditorDialog";
import { WorkflowRunsSidebar } from "../components/workflowDetail/WorkflowRunsSidebar";
import { WORKFLOW_DETAIL_TREE_STYLES } from "../lib/workflowDetailTreeStyles";
import { WorkflowDetailScreenInspectorPanel } from "./WorkflowDetailScreenInspectorPanel";
import { useWorkflowDetailChromeDispatch } from "../../../shell/WorkflowDetailChromeContext";

export function WorkflowDetailScreen(args: Readonly<{ workflowId: string; initialWorkflow?: WorkflowDto }>) {
  const controller = useWorkflowDetailController(args);
  const setChrome = useWorkflowDetailChromeDispatch();
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const activationAlertKey = (controller.workflowActivationAlertLines ?? []).join("\u0000");
  const credentialAttentionKey = controller.credentialAttentionSummaryLines.join("\u0000");

  const chromeStateKey = useMemo(
    () =>
      [
        controller.isLiveWorkflowView,
        controller.workflowIsActive,
        controller.isWorkflowActivationPending,
        activationAlertKey,
        credentialAttentionKey,
      ].join("|"),
    [
      controller.isLiveWorkflowView,
      controller.workflowIsActive,
      controller.isWorkflowActivationPending,
      activationAlertKey,
      credentialAttentionKey,
    ],
  );

  useEffect(() => {
    if (!setChrome) {
      return;
    }
    const c = controllerRef.current;
    setChrome({
      isLiveWorkflowView: c.isLiveWorkflowView,
      workflowIsActive: c.workflowIsActive,
      isWorkflowActivationPending: c.isWorkflowActivationPending,
      setWorkflowActive: (active) => {
        controllerRef.current.setWorkflowActive(active);
      },
      workflowActivationAlertLines: c.workflowActivationAlertLines,
      dismissWorkflowActivationAlert: () => {
        controllerRef.current.dismissWorkflowActivationAlert();
      },
      credentialAttentionSummaryLines: c.credentialAttentionSummaryLines,
    });
  }, [setChrome, chromeStateKey]);

  useEffect(() => {
    return () => {
      setChrome?.(null);
    };
  }, [setChrome]);

  const activeCanvasTab = controller.isRunsPaneVisible ? "executions" : "live";
  const shouldShowRealtimeBadge = controller.isLiveWorkflowView && !controller.isRunsPaneVisible;
  const realtimeBadge =
    controller.workflowDevBuildState.state === "failed"
      ? {
          className: "border-destructive/40 bg-destructive/10 text-destructive shadow-md ring-1 ring-foreground/10",
          label: "Rebuild failed. Latest code is not live yet.",
          testId: "workflow-dev-build-failed-indicator",
        }
      : controller.showRealtimeDisconnectedBadge
        ? {
            className:
              "border-amber-400/60 bg-amber-50 text-amber-950 shadow-md ring-1 ring-foreground/10 dark:bg-amber-950/20 dark:text-amber-100",
            label: "Realtime disconnected. Workflow edits won't auto-refresh.",
            testId: "workflow-realtime-disconnected-indicator",
          }
        : controller.workflowDevBuildState.state === "building"
          ? {
              className: "border-primary/40 bg-primary/10 text-primary shadow-md ring-1 ring-foreground/10",
              label: "Rebuilding workflow...",
              testId: "workflow-dev-build-started-indicator",
            }
          : null;

  return (
    <main className="h-full w-full min-h-0 overflow-hidden bg-muted/40">
      <section
        className={cn(
          "relative grid h-full min-h-0 w-full min-w-0 overflow-hidden",
          controller.isRunsPaneVisible ? "grid-cols-[minmax(0,320px)_minmax(0,1fr)]" : "grid-cols-1",
        )}
      >
        {controller.isRunsPaneVisible ? (
          <WorkflowRunsSidebar
            model={controller.sidebarModel}
            formatting={controller.sidebarFormatting}
            actions={controller.sidebarActions}
          />
        ) : null}

        <div
          className="grid h-full min-h-0 min-w-0 bg-muted/40"
          style={{
            gridTemplateRows: controller.isPanelCollapsed
              ? "minmax(0, 1fr) 36px"
              : `minmax(0, 1fr) ${controller.inspectorHeight}px`,
          }}
        >
          <div className="relative flex h-full min-h-0 min-w-0 flex-row overflow-hidden bg-muted/40">
            {controller.displayedWorkflow ? (
              <>
                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                  <WorkflowCanvas
                    workflow={controller.displayedWorkflow}
                    nodeSnapshotsByNodeId={controller.displayedNodeSnapshotsByNodeId}
                    connectionInvocations={controller.displayedConnectionInvocations}
                    credentialAttentionTooltipByNodeId={controller.credentialAttentionTooltipByNodeId}
                    pinnedNodeIds={controller.pinnedNodeIds}
                    selectedNodeId={controller.selectedNodeId}
                    propertiesTargetNodeId={controller.propertiesPanelNodeId}
                    isLiveWorkflowView={controller.isLiveWorkflowView}
                    isRunning={controller.isRunning}
                    onSelectNode={controller.selectCanvasNode}
                    onOpenPropertiesNode={controller.openPropertiesPanelForNode}
                    onRunNode={controller.runCanvasNode}
                    onTogglePinnedOutput={controller.toggleCanvasNodePin}
                    onEditNodeOutput={controller.editCanvasNodeOutput}
                    onClearPinnedOutput={controller.clearCanvasNodePin}
                    workflowNodeIdsWithBoundCredential={controller.workflowNodeIdsWithBoundCredential}
                    onRequestOpenCredentialEditForNode={controller.requestOpenCredentialEditForNode}
                  />
                </div>
                <NodePropertiesSlidePanel
                  workflowId={args.workflowId}
                  isOpen={controller.isPropertiesPanelOpen}
                  node={controller.selectedPropertiesWorkflowNode}
                  telemetryRunId={controller.propertiesPanelTelemetryRunId}
                  nodeSnapshotsByNodeId={controller.displayedNodeSnapshotsByNodeId}
                  connectionInvocations={controller.displayedConnectionInvocations}
                  onClose={controller.closePropertiesPanel}
                  pendingCredentialEditForNodeId={controller.pendingCredentialEditForNodeId}
                  onConsumedPendingCredentialEdit={controller.consumePendingCredentialEditRequest}
                />
              </>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Loading diagram…</div>
            )}
            <div className="pointer-events-none absolute top-3 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-2">
              <div className="pointer-events-auto flex overflow-hidden rounded-lg border border-border bg-card/95 shadow-md ring-1 ring-foreground/10">
                <Button
                  type="button"
                  data-testid="workflow-canvas-tab-live"
                  variant={activeCanvasTab === "live" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-none border-r border-border px-3 text-xs font-extrabold"
                  onClick={controller.openLiveWorkflow}
                  aria-pressed={activeCanvasTab === "live"}
                >
                  Live workflow
                </Button>
                <Button
                  type="button"
                  data-testid="workflow-canvas-tab-executions"
                  variant={activeCanvasTab === "executions" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-none px-3 text-xs font-extrabold"
                  onClick={controller.openExecutionsPane}
                  aria-pressed={activeCanvasTab === "executions"}
                >
                  Executions
                </Button>
              </div>
              {controller.canCopySelectedRunToLive ? (
                <Button
                  type="button"
                  data-testid="canvas-copy-to-live-button"
                  size="sm"
                  className="pointer-events-auto h-8 px-3 text-xs font-extrabold"
                  onClick={controller.copySelectedRunToLive}
                >
                  Copy to live
                </Button>
              ) : null}
            </div>
            {controller.isLiveWorkflowView && !controller.isRunsPaneVisible ? (
              <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[6] -translate-x-1/2">
                <Button
                  type="button"
                  data-testid="canvas-run-workflow-button"
                  size="sm"
                  className="h-8 px-3 text-xs font-extrabold"
                  onClick={controller.runWorkflowFromCanvas}
                  disabled={controller.isRunning}
                >
                  {controller.isRunning ? "Running..." : "Run workflow"}
                </Button>
              </div>
            ) : null}
            <div className="pointer-events-none absolute top-3 right-3 z-[6] flex max-w-[min(22rem,calc(100%-1.5rem))] flex-col items-end gap-2">
              {shouldShowRealtimeBadge && realtimeBadge ? (
                <div
                  data-testid={realtimeBadge.testId}
                  className={cn(
                    "pointer-events-auto rounded-md border px-2.5 py-2 text-xs font-bold",
                    realtimeBadge.className,
                  )}
                >
                  {realtimeBadge.label}
                </div>
              ) : null}
            </div>
          </div>

          <WorkflowDetailScreenInspectorPanel controller={controller} />
        </div>
      </section>
      {controller.jsonEditorState ? (
        <WorkflowJsonEditorDialog
          state={controller.jsonEditorState}
          onClose={controller.closeJsonEditor}
          onSave={(value, binaryMaps) => {
            controller.saveJsonEditor(value, binaryMaps);
          }}
        />
      ) : null}
      <style>{WORKFLOW_DETAIL_TREE_STYLES}</style>
    </main>
  );
}

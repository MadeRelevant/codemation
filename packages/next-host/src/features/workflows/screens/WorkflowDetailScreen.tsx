"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { WorkflowDetailScreenRealtimeBanner } from "./WorkflowDetailScreenRealtimeBanner";
import { useWorkflowDetailChromeDispatch } from "../../../shell/WorkflowDetailChromeContext";

export function WorkflowDetailScreen(args: Readonly<{ workflowId: string; initialWorkflow?: WorkflowDto }>) {
  const controller = useWorkflowDetailController(args);
  const [propertiesPanelWidthPx, setPropertiesPanelWidthPx] = useState(300);
  const handlePropertiesPanelWidthPxChange = useCallback((widthPx: number) => {
    setPropertiesPanelWidthPx(widthPx);
  }, []);
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
                  onClose={controller.closePropertiesPanel}
                  pendingCredentialEditForNodeId={controller.pendingCredentialEditForNodeId}
                  onConsumedPendingCredentialEdit={controller.consumePendingCredentialEditRequest}
                  onPanelWidthPxChange={handlePropertiesPanelWidthPxChange}
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
            <WorkflowDetailScreenRealtimeBanner
              workflowDevBuildState={controller.workflowDevBuildState}
              showRealtimeConnectedBanner={controller.showRealtimeConnectedBanner}
              showRealtimeDisconnectedBadge={controller.showRealtimeDisconnectedBadge}
              isLiveWorkflowView={controller.isLiveWorkflowView}
              isRunsPaneVisible={controller.isRunsPaneVisible}
              isPropertiesPanelOpen={controller.isPropertiesPanelOpen}
              hasSelectedPropertiesNode={controller.selectedPropertiesWorkflowNode != null}
              propertiesPanelWidthPx={propertiesPanelWidthPx}
            />
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

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WorkflowCanvas } from "../components/canvas/WorkflowCanvas";
import type { WorkflowDto } from "../hooks/realtime/realtime";
import { NodePropertiesSlidePanel } from "../components/workflowDetail/NodePropertiesSlidePanel";
import { useWorkflowDetailController } from "../hooks/workflowDetail/useWorkflowDetailController";
import { WorkflowRunsSidebar } from "../components/workflowDetail/WorkflowRunsSidebar";
import { WORKFLOW_DETAIL_TREE_STYLES } from "../lib/workflowDetailTreeStyles";
import { WorkflowDetailScreenCanvasTabs } from "./WorkflowDetailScreenCanvasTabs";
import { WorkflowDetailScreenInspectorPanel } from "./WorkflowDetailScreenInspectorPanel";
import { useWorkflowDetailChromeDispatch } from "../../../shell/WorkflowDetailChromeContext";
import { useWorkflowRealtimeBadgeState } from "../hooks/realtime/useWorkflowRealtimeShowDisconnectedBadge";
import { resolveWorkflowRealtimeBadge } from "./workflowDetailScreenRealtimeBadge";
import { WorkflowCanvasRunButton } from "../components/workflowDetail/WorkflowCanvasRunButton";
import { useWorkflowCanvasRunButton } from "../hooks/useWorkflowCanvasRunButton";
import { WorkflowJsonEditorDialog } from "../components/workflowDetail/WorkflowJsonEditorDialog";
import { WorkflowActivationErrorDialog } from "../components/workflowDetail/WorkflowActivationErrorDialog";

// Lazy-load the Tests view only: it pulls in recharts + the test-suite component tree which is
// conditionally rendered and would otherwise dominate Turbopack's module work for this route.
// WorkflowJsonEditorDialog is NOT lazy-loaded here: its Monaco dependency loads lazily on its
// own via @monaco-editor/react, and wrapping the dialog in next/dynamic breaks jsdom integration
// tests (the dynamic wrapper delays the dialog mount past the test-suite's waitFor window).
const WorkflowDetailScreenTestsView = dynamic(
  () =>
    import("./WorkflowDetailScreenTestsView").then((mod) => ({
      default: mod.WorkflowDetailScreenTestsView,
    })),
  { ssr: false },
);

export function WorkflowDetailScreen(args: Readonly<{ workflowId: string; initialWorkflow?: WorkflowDto }>) {
  const controller = useWorkflowDetailController(args);
  const [isTestsViewActive, setIsTestsViewActive] = useState(false);
  const [autoStartTestTriggerNodeId, setAutoStartTestTriggerNodeId] = useState<string | undefined>();
  const workflowNodes = controller.displayedWorkflow?.nodes ?? [];
  const setChrome = useWorkflowDetailChromeDispatch();
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const handleRunTestTrigger = (nodeId: string) => {
    setAutoStartTestTriggerNodeId(nodeId);
    setIsTestsViewActive(true);
  };

  const runButtonState = useWorkflowCanvasRunButton({
    workflowId: args.workflowId,
    workflowNodes,
    isRunning: controller.isRunning,
    // TODO(multi-trigger): thread `nodeId` into runExecution as `startAt` once the backend
    // honours startAt alongside currentState. Until then a full-workflow run is correct — the
    // backend picks the trigger via synthesizeTriggerItems.
    onRunLiveTrigger: () => controller.runWorkflowFromCanvas(),
    onRunTestTrigger: handleRunTestTrigger,
  });

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

  const activeCanvasTab = isTestsViewActive ? "tests" : controller.isRunsPaneVisible ? "executions" : "live";
  const shouldShowRealtimeBadge = !isTestsViewActive && controller.isLiveWorkflowView && !controller.isRunsPaneVisible;
  const badgeState = useWorkflowRealtimeBadgeState();

  const realtimeBadge = resolveWorkflowRealtimeBadge(badgeState);

  if (isTestsViewActive) {
    return (
      <WorkflowDetailScreenTestsView
        workflowId={args.workflowId}
        workflowNodes={workflowNodes}
        onSwitchToLive={() => {
          setIsTestsViewActive(false);
          setAutoStartTestTriggerNodeId(undefined);
          controller.openLiveWorkflow();
        }}
        onSwitchToExecutions={() => {
          setIsTestsViewActive(false);
          setAutoStartTestTriggerNodeId(undefined);
          controller.openExecutionsPane();
        }}
        autoStartTriggerNodeId={autoStartTestTriggerNodeId}
      />
    );
  }

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
                    selectedNodeId={controller.selectedCanvasNodeId}
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
                  telemetryRunStatus={controller.propertiesPanelTelemetryRunStatus}
                  nodeSnapshotsByNodeId={controller.displayedNodeSnapshotsByNodeId}
                  connectionInvocations={controller.displayedConnectionInvocations}
                  onClose={controller.closePropertiesPanel}
                  pendingCredentialEditForNodeId={controller.pendingCredentialEditForNodeId}
                  onConsumedPendingCredentialEdit={controller.consumePendingCredentialEditRequest}
                  focusedInvocationId={controller.focusedInvocationIdInPropertiesPanel}
                  onSelectInvocation={controller.selectInvocationInPropertiesPanel}
                />
              </>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Loading diagram…</div>
            )}
            <div className="pointer-events-none absolute top-3 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-2">
              <WorkflowDetailScreenCanvasTabs
                activeCanvasTab={activeCanvasTab}
                onSelectLive={controller.openLiveWorkflow}
                onSelectExecutions={controller.openExecutionsPane}
                onSelectTests={() => setIsTestsViewActive(true)}
              />
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
            {controller.isLiveWorkflowView && !controller.isRunsPaneVisible && runButtonState.triggers.length > 0 ? (
              <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[6] -translate-x-1/2">
                <WorkflowCanvasRunButton
                  triggers={runButtonState.triggers}
                  selectedTriggerNodeId={runButtonState.selectedTriggerNodeId}
                  isRunning={controller.isRunning}
                  disabled={runButtonState.isDisabled}
                  onSelect={runButtonState.handleSelectTrigger}
                  onRunLive={runButtonState.handleRunLiveTrigger}
                  onRunTest={runButtonState.handleRunTestTrigger}
                />
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
      {controller.runErrorAlertLines && controller.runErrorAlertLines.length > 0 ? (
        <WorkflowActivationErrorDialog
          open
          title="Could not start run"
          alertLines={controller.runErrorAlertLines}
          onDismiss={controller.dismissRunErrorAlert}
        />
      ) : null}
      <style>{WORKFLOW_DETAIL_TREE_STYLES}</style>
    </main>
  );
}

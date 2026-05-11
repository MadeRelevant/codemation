"use client";

import React, { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { WorkflowCanvasApiClient } from "../types/WorkflowCanvasApiClient";
import type { NavigationAdapter } from "../types/NavigationAdapter";
import type { WorkflowDetailChromeState } from "../types/WorkflowDetailChromeState";
import type { WorkflowCanvasConfig } from "../types/WorkflowCanvasConfig";
import { WorkflowCanvasApiClientProvider, useWorkflowCanvasApiClient } from "../context/WorkflowCanvasApiClientContext";
import { WorkflowCanvasConfigProvider } from "../context/WorkflowCanvasConfigContext";
import { WorkflowCanvas } from "../canvas/WorkflowCanvas";
import type { WorkflowDto } from "../realtime/realtimeDomainTypes";
import { NodePropertiesSlidePanel } from "../panels/NodePropertiesSlidePanel";
import { useWorkflowDetailController } from "../hooks/workflowDetail/useWorkflowDetailController";
import { WorkflowRunsSidebar } from "../panels/WorkflowRunsSidebar";
import { WORKFLOW_DETAIL_TREE_STYLES } from "../lib/workflowDetailTreeStyles";
import { WorkflowDetailScreenCanvasTabs } from "./WorkflowDetailScreenCanvasTabs";
import { WorkflowDetailScreenInspectorPanel } from "./WorkflowDetailScreenInspectorPanel";
import { useWorkflowRealtimeBadgeState } from "../hooks/realtime/useWorkflowRealtimeShowDisconnectedBadge";
import { resolveWorkflowRealtimeBadge } from "./workflowDetailScreenRealtimeBadge";
import { WorkflowCanvasRunButton } from "../panels/WorkflowCanvasRunButton";
import { useWorkflowCanvasRunButton } from "../hooks/useWorkflowCanvasRunButton";
import { WorkflowJsonEditorDialog } from "../panels/WorkflowJsonEditorDialog";
import { WorkflowActivationErrorDialog } from "../panels/WorkflowActivationErrorDialog";
import { useWorkflowDetailScreenThemeStyle } from "./useWorkflowDetailScreenThemeStyle";
import { useWorkflowDetailChromeSync } from "./useWorkflowDetailChromeSync";

// Lazy-load the Tests view only: it pulls in recharts + the test-suite component tree which is
// conditionally rendered and would otherwise dominate module work for this route.
const LazyWorkflowDetailScreenTestsView = React.lazy(() =>
  import("./WorkflowDetailScreenTestsView").then((m) => ({ default: m.WorkflowDetailScreenTestsView })),
);

const noOpNavigation: NavigationAdapter = {
  urlLocation: { selectedRunId: null, isRunsPaneVisible: false, nodeId: null },
  navigateToLocation: () => {},
};

export interface WorkflowDetailScreenArgs {
  workflowId: string;
  initialWorkflow?: WorkflowDto;
  /** Defaults to the nearest WorkflowCanvasApiClientProvider in context when omitted. */
  apiClient?: WorkflowCanvasApiClient;
  navigation?: NavigationAdapter;
  onChromeChange?: (state: WorkflowDetailChromeState | null) => void;
  config?: WorkflowCanvasConfig;
}

export function WorkflowDetailScreen(args: Readonly<WorkflowDetailScreenArgs>) {
  const contextApiClient = useWorkflowCanvasApiClient();
  const resolvedApiClient = args.apiClient ?? contextApiClient;
  const resolvedNavigation = args.navigation ?? noOpNavigation;
  const controller = useWorkflowDetailController({
    workflowId: args.workflowId,
    initialWorkflow: args.initialWorkflow,
    navigation: resolvedNavigation,
    config: args.config,
  });
  const [isTestsViewActive, setIsTestsViewActive] = useState(false);
  const [autoStartTestTriggerNodeId, setAutoStartTestTriggerNodeId] = useState<string | undefined>();
  const workflowNodes = controller.displayedWorkflow?.nodes ?? [];
  const { onChromeChange } = args;
  useWorkflowDetailChromeSync(controller, onChromeChange);

  const handleRunTestTrigger = (nodeId: string) => {
    setAutoStartTestTriggerNodeId(nodeId);
    setIsTestsViewActive(true);
  };

  const runButtonState = useWorkflowCanvasRunButton({
    workflowId: args.workflowId,
    workflowNodes,
    isRunning: controller.isRunning,
    onRunLiveTrigger: () => controller.runWorkflowFromCanvas(),
    onRunTestTrigger: handleRunTestTrigger,
  });

  const themeStyle = useWorkflowDetailScreenThemeStyle(args.config);

  const activeCanvasTab = isTestsViewActive ? "tests" : controller.isRunsPaneVisible ? "executions" : "live";
  const shouldShowRealtimeBadge = !isTestsViewActive && controller.isLiveWorkflowView && !controller.isRunsPaneVisible;
  const badgeState = useWorkflowRealtimeBadgeState();
  const realtimeBadge = resolveWorkflowRealtimeBadge(badgeState);

  const body = isTestsViewActive ? (
    <Suspense fallback={null}>
      <LazyWorkflowDetailScreenTestsView
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
    </Suspense>
  ) : (
    <main className="h-full w-full min-h-0 overflow-hidden bg-muted/40" style={themeStyle}>
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
                    config={args.config}
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

  return (
    <WorkflowCanvasApiClientProvider value={resolvedApiClient}>
      <WorkflowCanvasConfigProvider value={args.config}>{body}</WorkflowCanvasConfigProvider>
    </WorkflowCanvasApiClientProvider>
  );
}

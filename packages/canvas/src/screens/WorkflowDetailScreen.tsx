"use client";

/* eslint-disable max-lines -- Slot wiring + ctx assembly inherently large; tracked in backlog for refactor. */

import React, { Suspense, useEffect, useState } from "react";

import { cn } from "@codemation/ui";

import type {
  WorkflowCanvasApiClient,
  NavigationAdapter,
  WorkflowDetailChromeState,
  WorkflowCanvasConfig,
  WorkflowDto,
  WorkflowDetailHeaderSlotContext,
  WorkflowDetailTabsSlotContext,
  WorkflowDetailInspectorSlotContext,
  WorkflowDetailRunButtonSlotContext,
} from "@codemation/canvas-core";
import {
  WorkflowCanvasApiClientProvider,
  useWorkflowCanvasApiClient,
  WorkflowCanvasConfigProvider,
  useWorkflowDetailController,
  WORKFLOW_DETAIL_TREE_STYLES,
  useWorkflowRealtimeBadgeState,
  useWorkflowCanvasRunButton,
} from "@codemation/canvas-core";
import { WorkflowCanvas } from "../canvas/WorkflowCanvas";
import { NodePropertiesSlidePanel } from "../panels/NodePropertiesSlidePanel";
import { WorkflowRunInternalErrorDialog } from "../panels/WorkflowRunInternalErrorDialog";
import { WorkflowRunsSidebar } from "../panels/WorkflowRunsSidebar";
import { resolveWorkflowRealtimeBadge } from "./workflowDetailScreenRealtimeBadge";
import AlertCircle from "lucide-react/dist/esm/icons/alert-circle";
import { WorkflowJsonEditorMount } from "./WorkflowJsonEditorMount";
import { useWorkflowDetailScreenThemeStyle } from "./useWorkflowDetailScreenThemeStyle";
import { useWorkflowDetailChromeSync } from "./useWorkflowDetailChromeSync";
import { useLocalNavigation } from "./useLocalNavigation";
import { DefaultHeader } from "./defaults/DefaultHeader";
import { DefaultTabs } from "./defaults/DefaultTabs";
import { DefaultInspector } from "./defaults/DefaultInspector";
import { DefaultLoadingState } from "./defaults/DefaultLoadingState";
import { DefaultEmptyState } from "./defaults/DefaultEmptyState";
import { DefaultRunButton } from "./defaults/DefaultRunButton";

// Lazy-load the Tests view only: it pulls in recharts + the test-suite component tree which is
// conditionally rendered and would otherwise dominate module work for this route.
const LazyWorkflowDetailScreenTestsView = React.lazy(() =>
  import("./WorkflowDetailScreenTestsView").then((m) => ({ default: m.WorkflowDetailScreenTestsView })),
);

export interface WorkflowDetailScreenArgs {
  workflowId: string;
  initialWorkflow?: WorkflowDto;
  /** Defaults to the nearest WorkflowCanvasApiClientProvider in context when omitted. */
  apiClient?: WorkflowCanvasApiClient;
  navigation?: NavigationAdapter;
  onChromeChange?: (state: WorkflowDetailChromeState | null) => void;
  config?: WorkflowCanvasConfig;
  // --- Slot render props (all optional; default rendering preserved when omitted) ---
  renderHeader?: (ctx: WorkflowDetailHeaderSlotContext) => React.ReactNode;
  renderTabs?: (ctx: WorkflowDetailTabsSlotContext) => React.ReactNode;
  renderInspector?: (ctx: WorkflowDetailInspectorSlotContext) => React.ReactNode;
  renderLoadingState?: () => React.ReactNode;
  renderEmptyState?: () => React.ReactNode;
  renderRunButton?: (ctx: WorkflowDetailRunButtonSlotContext) => React.ReactNode;
  // --- Layout toggles ---
  /** Collapses the runs pane sidebar (grid switches from 2-col to 1-col). */
  hideRunsPaneSidebar?: boolean;
  /** Removes the tab strip area. */
  hideTabs?: boolean;
}

export function WorkflowDetailScreen(args: Readonly<WorkflowDetailScreenArgs>) {
  const contextApiClient = useWorkflowCanvasApiClient();
  const resolvedApiClient = args.apiClient ?? contextApiClient;
  const localNavigation = useLocalNavigation();
  const resolvedNavigation = args.navigation ?? localNavigation;
  const controller = useWorkflowDetailController({
    workflowId: args.workflowId,
    initialWorkflow: args.initialWorkflow,
    navigation: resolvedNavigation,
    config: args.config,
  });
  const [isTestsViewActive, setIsTestsViewActive] = useState(false);
  const [autoStartTestTriggerNodeId, setAutoStartTestTriggerNodeId] = useState<string | undefined>();
  // Prevents hydration mismatch: server always renders the loading state; the canvas only
  // renders after client mount. Without this gate the React Query warm cache can make the
  // client's first render differ from the server's (which has no cached data), producing
  // "Hydration failed" console errors because the server yields DefaultLoadingState while
  // the client yields the real WorkflowCanvas element tree.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
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

  // Build slot ctx objects (minimal subsets).
  const headerCtx: WorkflowDetailHeaderSlotContext = {
    workflowId: args.workflowId,
    workflowName: controller.displayedWorkflow?.name,
    isRunning: controller.isRunning,
    isLiveWorkflowView: controller.isLiveWorkflowView,
  };

  const tabsCtx: WorkflowDetailTabsSlotContext = {
    activeCanvasTab,
    onSelectLive: controller.openLiveWorkflow,
    onSelectExecutions: controller.openExecutionsPane,
    onSelectTests: () => setIsTestsViewActive(true),
  };

  const inspectorCtx: WorkflowDetailInspectorSlotContext = {
    inspect: {
      selectedNodeId: controller.selectedNodeId,
      selectedCanvasNodeId: controller.selectedCanvasNodeId,
      propertiesPanelNodeId: controller.propertiesPanelNodeId,
      isPropertiesPanelOpen: controller.isPropertiesPanelOpen,
      isPanelCollapsed: controller.isPanelCollapsed,
      inspectorHeight: controller.inspectorHeight,
      startInspectorResize: controller.startInspectorResize,
      toggleInspectorPanel: controller.toggleInspectorPanel,
      inspectorModel: controller.inspectorModel,
      inspectorFormatting: controller.inspectorFormatting,
      inspectorActions: controller.inspectorActions,
    },
    pin: {
      pinnedNodeIds: controller.pinnedNodeIds,
      togglePin: controller.toggleCanvasNodePin,
      editOutput: controller.editCanvasNodeOutput,
      clearPin: controller.clearCanvasNodePin,
    },
    jsonEdit: {
      jsonEditorState: controller.jsonEditorState,
      closeJsonEditor: controller.closeJsonEditor,
      saveJsonEditor: controller.saveJsonEditor,
    },
  };

  const runButtonCtx: WorkflowDetailRunButtonSlotContext = { run: runButtonState };

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
      {args.renderHeader ? args.renderHeader(headerCtx) : <DefaultHeader ctx={headerCtx} />}
      <section
        className={cn(
          "relative grid h-full min-h-0 w-full min-w-0 overflow-hidden",
          !args.hideRunsPaneSidebar && controller.isRunsPaneVisible
            ? "grid-cols-[minmax(0,320px)_minmax(0,1fr)]"
            : "grid-cols-1",
        )}
      >
        {!args.hideRunsPaneSidebar && controller.isRunsPaneVisible ? (
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
            {hasMounted && controller.displayedWorkflow ? (
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
                    runId={controller.viewedRunId}
                    runStatus={controller.viewedRunStatus}
                    onSelectNode={controller.selectCanvasNode}
                    onOpenPropertiesNode={controller.openPropertiesPanelForNode}
                    onRunNode={controller.runCanvasNode}
                    onTogglePinnedOutput={controller.toggleCanvasNodePin}
                    onEditNodeOutput={controller.editCanvasNodeOutput}
                    onClearPinnedOutput={controller.clearCanvasNodePin}
                    workflowNodeIdsWithBoundCredential={controller.workflowNodeIdsWithBoundCredential}
                    onRequestOpenCredentialEditForNode={controller.requestOpenCredentialEditForNode}
                    onPaneClick={controller.closePropertiesPanel}
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
            ) : args.renderLoadingState ? (
              args.renderLoadingState()
            ) : (
              <DefaultLoadingState />
            )}
            {hasMounted && !args.hideTabs ? (
              <div
                data-testid="workflow-detail-tabs-area"
                className="pointer-events-none absolute top-3 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-2"
              >
                {args.renderTabs ? (
                  args.renderTabs(tabsCtx)
                ) : (
                  <DefaultTabs
                    ctx={tabsCtx}
                    canCopySelectedRunToLive={controller.canCopySelectedRunToLive}
                    onCopyToLive={controller.copySelectedRunToLive}
                  />
                )}
              </div>
            ) : null}
            {hasMounted &&
            controller.isLiveWorkflowView &&
            !controller.isRunsPaneVisible &&
            runButtonState.triggers.length > 0 &&
            !isTestsViewActive ? (
              <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[6] -translate-x-1/2">
                {args.renderRunButton ? (
                  args.renderRunButton(runButtonCtx)
                ) : (
                  <DefaultRunButton ctx={runButtonCtx} isRunning={controller.isRunning} />
                )}
              </div>
            ) : null}
            <div className="pointer-events-none absolute top-3 right-3 z-[6] flex max-w-[min(22rem,calc(100%-1.5rem))] flex-col items-end gap-2">
              {hasMounted && shouldShowRealtimeBadge && realtimeBadge ? (
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
              {hasMounted && controller.runErrorAlertLines && controller.runErrorAlertLines.length > 0 ? (
                <div
                  data-testid="workflow-run-error-banner"
                  className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border border-destructive/40 bg-background px-3 py-2 shadow-md ring-1 ring-destructive/20"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={2.25} aria-hidden />
                  <div className="min-w-0 flex-1 text-xs text-destructive">
                    {controller.runErrorAlertLines.length === 1 ? (
                      <p>{controller.runErrorAlertLines[0]}</p>
                    ) : (
                      <ul className="list-inside list-disc space-y-0.5">
                        {controller.runErrorAlertLines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={controller.dismissRunErrorAlert}
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {args.renderInspector ? args.renderInspector(inspectorCtx) : <DefaultInspector ctx={inspectorCtx} />}
        </div>
      </section>
      {args.renderEmptyState ? args.renderEmptyState() : <DefaultEmptyState />}
      {controller.jsonEditorState ? (
        <WorkflowJsonEditorMount
          state={controller.jsonEditorState}
          onClose={controller.closeJsonEditor}
          onSave={controller.saveJsonEditor}
          renderOverride={args.config?.renderWorkflowJsonEditor}
        />
      ) : null}
      <WorkflowRunInternalErrorDialog
        open={controller.runInternalError !== null}
        error={controller.runInternalError}
        onDismiss={controller.dismissRunInternalError}
      />
      <style>{WORKFLOW_DETAIL_TREE_STYLES}</style>
    </main>
  );

  return (
    <WorkflowCanvasApiClientProvider value={resolvedApiClient}>
      <WorkflowCanvasConfigProvider value={args.config}>{body}</WorkflowCanvasConfigProvider>
    </WorkflowCanvasApiClientProvider>
  );
}

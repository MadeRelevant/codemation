"use client";
import { useCallback } from "react";
import type { NavigationAdapter } from "../../types/NavigationAdapter";
import type { WorkflowCanvasConfig } from "../../types/WorkflowCanvasConfig";
import type { WorkflowDto } from "../realtime/realtime";
import type { JsonEditorState, PinBinaryMapsByItemIndex } from "../../lib/workflowDetail/workflowDetailTypes";
import { WorkflowDetailPresenter } from "../../lib/workflowDetail/WorkflowDetailPresenter";
import { useWorkflowRunController } from "./useWorkflowRunController";
import { useWorkflowInspectController } from "./useWorkflowInspectController";
import { useWorkflowPinController } from "./useWorkflowPinController";
import { useWorkflowJsonEditController } from "./useWorkflowJsonEditController";

// Stable no-ops for read-only mode.
const NO_OP_NODE_ACTION = (_nodeId: string): void => {};

export type WorkflowDetailControllerResult = Readonly<{
  displayedWorkflow: WorkflowDto | undefined;
  displayedNodeSnapshotsByNodeId: Readonly<Record<string, import("../realtime/realtime").NodeExecutionSnapshot>>;
  displayedConnectionInvocations: ReadonlyArray<
    NonNullable<import("../realtime/realtime").PersistedRunState["connectionInvocations"]>[number]
  >;
  pinnedNodeIds: ReadonlySet<string>;
  isLiveWorkflowView: boolean;
  isRunsPaneVisible: boolean;
  isRunning: boolean;
  workflowDevBuildState: import("../realtime/realtime").WorkflowDevBuildState;
  showRealtimeDisconnectedBadge: boolean;
  canCopySelectedRunToLive: boolean;
  credentialAttentionNodeIds: ReadonlySet<string>;
  credentialAttentionSummaryLines: ReadonlyArray<string>;
  credentialAttentionTooltipByNodeId: ReadonlyMap<string, string>;
  workflowNodeIdsWithBoundCredential: ReadonlySet<string>;
  selectedRun: import("../realtime/realtime").PersistedRunState | undefined;
  propertiesPanelTelemetryRunId: string | null;
  propertiesPanelTelemetryRunStatus: import("../realtime/realtime").PersistedRunState["status"] | undefined;
  focusedInvocationIdInPropertiesPanel: string | null;
  selectInvocationInPropertiesPanel: (invocationId: string) => void;
  sidebarModel: import("../../lib/workflowDetail/workflowDetailTypes").WorkflowRunsSidebarModel;
  sidebarFormatting: import("../../lib/workflowDetail/workflowDetailTypes").WorkflowRunsSidebarFormatting;
  sidebarActions: import("../../lib/workflowDetail/workflowDetailTypes").WorkflowRunsSidebarActions;
  inspectorModel: import("../../lib/workflowDetail/workflowDetailTypes").WorkflowExecutionInspectorModel;
  inspectorFormatting: import("../../lib/workflowDetail/workflowDetailTypes").WorkflowExecutionInspectorFormatting;
  inspectorActions: import("../../lib/workflowDetail/workflowDetailTypes").WorkflowExecutionInspectorActions;
  selectedNodeId: string | null;
  selectedCanvasNodeId: string | null;
  propertiesPanelNodeId: string | null;
  isPropertiesPanelOpen: boolean;
  selectedPropertiesWorkflowNode: WorkflowDto["nodes"][number] | undefined;
  selectCanvasNode: (nodeId: string) => void;
  openPropertiesPanelForNode: (nodeId: string) => void;
  requestOpenCredentialEditForNode: (nodeId: string) => void;
  pendingCredentialEditForNodeId: string | null;
  consumePendingCredentialEditRequest: () => void;
  closePropertiesPanel: () => void;
  runCanvasNode: (nodeId: string) => void;
  toggleCanvasNodePin: (nodeId: string) => void;
  editCanvasNodeOutput: (nodeId: string) => void;
  clearCanvasNodePin: (nodeId: string) => void;
  runWorkflowFromCanvas: () => void;
  openLiveWorkflow: () => void;
  openExecutionsPane: () => void;
  copySelectedRunToLive: () => void;
  isPanelCollapsed: boolean;
  inspectorHeight: number;
  startInspectorResize: (clientY: number) => void;
  toggleInspectorPanel: () => void;
  jsonEditorState: JsonEditorState | null;
  closeJsonEditor: () => void;
  saveJsonEditor: (value: string, binaryMaps?: PinBinaryMapsByItemIndex) => void;
  workflowIsActive: boolean;
  isWorkflowActivationPending: boolean;
  workflowActivationAlertLines: ReadonlyArray<string> | null;
  dismissWorkflowActivationAlert: () => void;
  setWorkflowActive: (active: boolean) => void;
  runErrorAlertLines: ReadonlyArray<string> | null;
  dismissRunErrorAlert: () => void;
}>;

export function useWorkflowDetailController(
  args: Readonly<{
    workflowId: string;
    initialWorkflow?: WorkflowDto;
    navigation: NavigationAdapter;
    config?: WorkflowCanvasConfig;
  }>,
): WorkflowDetailControllerResult {
  const { workflowId, initialWorkflow, navigation, config } = args;
  const isReadOnly = config?.readOnly === true;
  const { urlLocation } = navigation;
  const selectedRunId = urlLocation.selectedRunId;

  // Sub-controllers called in stable order every render.
  const run = useWorkflowRunController({ workflowId, initialWorkflow, navigation, config });

  const inspect = useWorkflowInspectController({
    workflowId,
    navigation,
    viewContext: run.viewContext,
    currentExecutionState: run.currentExecutionState,
    displayedWorkflow: run.displayedWorkflow,
    workflow: run.workflow,
    normalizedConnectionInvocations: run.displayedConnectionInvocations,
    isRunning: run.isRunning,
  });

  // Pin controller reads inspect's selected node/port so resolveOutputPortForNode
  // can use the current inspector selection as the preferred port.
  const pin = useWorkflowPinController({
    workflowId,
    viewContext: run.viewContext,
    currentExecutionState: run.currentExecutionState,
    displayedWorkflow: run.displayedWorkflow,
    replaceDebuggerOverlay: run.replaceDebuggerOverlay,
    selectedNodeId: inspect.selectedNodeId,
    selectedOutputPort: inspect.selectedOutputPort,
  });

  // JSON editor controller: save callback routes to pin or run based on editor mode.
  const handleJsonEditorSave = useCallback(
    (value: string, binaryMaps: PinBinaryMapsByItemIndex | undefined, state: JsonEditorState): Promise<void> => {
      if (state.mode === "workflow-snapshot") {
        if (!selectedRunId) return Promise.resolve();
        return run.persistWorkflowSnapshotUpdate(selectedRunId, value);
      }
      if (state.mode === "pin-output") {
        const pinnedItems =
          binaryMaps !== undefined
            ? WorkflowDetailPresenter.mergePinOutputJsonWithBinaryMaps(value, binaryMaps)
            : WorkflowDetailPresenter.parseEditableItems(value);
        return pin.commitPinEdit(state.nodeId, state.outputPort, pinnedItems);
      }
      return Promise.resolve();
    },
    [pin, run, selectedRunId],
  );

  const jsonEdit = useWorkflowJsonEditController({ workflowId, onSave: handleJsonEditorSave });

  // Compose cross-concern canvas actions. These call inspect selection + pin/run ops.
  const toggleCanvasNodePin = useCallback(
    (nodeId: string) => {
      if (run.viewContext !== "live-workflow") return;
      const port = pin.resolveOutputPortForNode(nodeId);
      if (!port) return;
      inspect.selectNodeAndOutputPort(nodeId, port);
      pin.togglePinnedOutput(nodeId, port);
    },
    [inspect, pin, run.viewContext],
  );

  const editCanvasNodeOutput = useCallback(
    (nodeId: string) => {
      if (run.viewContext !== "live-workflow") return;
      const port = pin.resolveOutputPortForNode(nodeId);
      if (!port) return;
      const editorState = pin.buildPinEditorState(nodeId, port);
      if (!editorState) return;
      inspect.selectNodeAndOutputPort(nodeId, port);
      jsonEdit.openEditor(editorState);
    },
    [inspect, jsonEdit, pin, run.viewContext],
  );

  const clearCanvasNodePin = useCallback(
    (nodeId: string) => {
      if (run.viewContext !== "live-workflow") return;
      const port = pin.resolveOutputPortForNode(nodeId);
      if (!port) return;
      inspect.selectNodeAndOutputPort(nodeId, port);
      pin.clearPinnedOutput(nodeId, port);
    },
    [inspect, pin, run.viewContext],
  );

  const runCanvasNode = useCallback(
    (nodeId: string) => {
      if (run.viewContext !== "live-workflow") return;
      inspect.selectNodeForRun(nodeId);
      run.startRunForNode(nodeId);
    },
    [inspect, run],
  );

  // Compose inspector actions: override the pin-action stubs from inspect with
  // the real composed callbacks that have access to pin + jsonEdit.
  const onEditSelectedOutput = useCallback(() => {
    const nodeId = inspect.selectedNodeId;
    if (!nodeId || run.viewContext !== "live-workflow") return;
    const port = pin.resolveOutputPortForNode(nodeId);
    if (!port) return;
    const editorState = pin.buildPinEditorState(nodeId, port);
    if (!editorState) return;
    jsonEdit.openEditor(editorState);
  }, [inspect.selectedNodeId, jsonEdit, pin, run.viewContext]);

  const onClearPinnedOutput = useCallback(() => {
    const nodeId = inspect.selectedNodeId;
    const outputPort = inspect.selectedOutputPort;
    if (!nodeId || !outputPort || run.viewContext !== "live-workflow") return;
    pin.clearPinnedOutput(nodeId, outputPort);
  }, [inspect.selectedNodeId, inspect.selectedOutputPort, pin, run.viewContext]);

  const composedInspectorActions = {
    ...inspect.inspectorActions,
    onEditSelectedOutput,
    onClearPinnedOutput,
  };

  return {
    // From run controller
    displayedWorkflow: run.displayedWorkflow,
    displayedNodeSnapshotsByNodeId: run.displayedNodeSnapshotsByNodeId,
    displayedConnectionInvocations: run.displayedConnectionInvocations,
    pinnedNodeIds: run.pinnedNodeIds,
    isLiveWorkflowView: run.isLiveWorkflowView,
    isRunsPaneVisible: run.isRunsPaneVisible,
    isRunning: run.isRunning,
    workflowDevBuildState: run.workflowDevBuildState,
    showRealtimeDisconnectedBadge: run.showRealtimeDisconnectedBadge,
    canCopySelectedRunToLive: run.canCopySelectedRunToLive,
    credentialAttentionNodeIds: run.credentialAttentionNodeIds,
    credentialAttentionSummaryLines: run.credentialAttentionSummaryLines,
    credentialAttentionTooltipByNodeId: run.credentialAttentionTooltipByNodeId,
    workflowNodeIdsWithBoundCredential: run.workflowNodeIdsWithBoundCredential,
    selectedRun: run.selectedRun,
    propertiesPanelTelemetryRunId: run.propertiesPanelTelemetryRunId,
    propertiesPanelTelemetryRunStatus: run.propertiesPanelTelemetryRunStatus,
    sidebarModel: run.sidebarModel,
    sidebarFormatting: run.sidebarFormatting,
    sidebarActions: run.sidebarActions,
    runWorkflowFromCanvas: run.runWorkflowFromCanvas,
    openLiveWorkflow: run.openLiveWorkflow,
    openExecutionsPane: run.openExecutionsPane,
    copySelectedRunToLive: run.copySelectedRunToLive,
    workflowIsActive: run.workflowIsActive,
    isWorkflowActivationPending: run.isWorkflowActivationPending,
    workflowActivationAlertLines: run.workflowActivationAlertLines,
    dismissWorkflowActivationAlert: run.dismissWorkflowActivationAlert,
    setWorkflowActive: run.setWorkflowActive,
    runErrorAlertLines: run.runErrorAlertLines,
    dismissRunErrorAlert: run.dismissRunErrorAlert,
    // From inspect controller
    selectedNodeId: inspect.selectedNodeId,
    selectedCanvasNodeId: inspect.selectedCanvasNodeId,
    propertiesPanelNodeId: inspect.propertiesPanelNodeId,
    isPropertiesPanelOpen: inspect.isPropertiesPanelOpen,
    selectedPropertiesWorkflowNode: inspect.selectedPropertiesWorkflowNode,
    selectCanvasNode: inspect.selectCanvasNode,
    openPropertiesPanelForNode: inspect.openPropertiesPanelForNode,
    requestOpenCredentialEditForNode: inspect.requestOpenCredentialEditForNode,
    pendingCredentialEditForNodeId: inspect.pendingCredentialEditForNodeId,
    consumePendingCredentialEditRequest: inspect.consumePendingCredentialEditRequest,
    closePropertiesPanel: inspect.closePropertiesPanel,
    focusedInvocationIdInPropertiesPanel: inspect.focusedInvocationIdInPropertiesPanel,
    selectInvocationInPropertiesPanel: inspect.selectInvocationInPropertiesPanel,
    isPanelCollapsed: inspect.isPanelCollapsed,
    inspectorHeight: inspect.inspectorHeight,
    startInspectorResize: inspect.startInspectorResize,
    toggleInspectorPanel: inspect.toggleInspectorPanel,
    inspectorModel: inspect.inspectorModel,
    inspectorFormatting: inspect.inspectorFormatting,
    inspectorActions: composedInspectorActions,
    // Composed cross-concern canvas actions
    runCanvasNode: isReadOnly ? NO_OP_NODE_ACTION : runCanvasNode,
    toggleCanvasNodePin: isReadOnly ? NO_OP_NODE_ACTION : toggleCanvasNodePin,
    editCanvasNodeOutput: isReadOnly ? NO_OP_NODE_ACTION : editCanvasNodeOutput,
    clearCanvasNodePin: isReadOnly ? NO_OP_NODE_ACTION : clearCanvasNodePin,
    // From json-edit controller
    jsonEditorState: jsonEdit.jsonEditorState,
    closeJsonEditor: jsonEdit.closeJsonEditor,
    saveJsonEditor: jsonEdit.saveJsonEditor,
  };
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Stable no-op for inspector action stubs (pin actions are composed by the façade).
const NO_OP_VOID_ACTION = (): void => {};
import { WorkflowDetailPresenter } from "../../lib/workflowDetail/WorkflowDetailPresenter";
import {
  useRunDetailQuery,
  useRunQuery,
  type NodeExecutionSnapshot,
  type PersistedRunState,
  type RunCurrentState,
  type WorkflowDto,
} from "../realtime/realtime";
import type {
  InspectorFormat,
  InspectorMode,
  InspectorTab,
  ViewedWorkflowContext,
  WorkflowExecutionInspectorTreeSelection,
} from "../../lib/workflowDetail/workflowDetailTypes";
import type { NavigationAdapter } from "../../types/NavigationAdapter";
import type { WorkflowInspectControllerReturn } from "../../types/workflowDetail/WorkflowInspectControllerReturn.types";

const MIN_INSPECTOR_HEIGHT = 240;
const MAX_INSPECTOR_HEIGHT = 640;

export function useWorkflowInspectController(
  args: Readonly<{
    workflowId: string;
    navigation: NavigationAdapter;
    // Run state read via props (D5 compliant: reading from run controller's outputs)
    viewContext: ViewedWorkflowContext;
    currentExecutionState: RunCurrentState | PersistedRunState | undefined;
    displayedWorkflow: WorkflowDto | undefined;
    workflow: WorkflowDto | undefined;
    normalizedConnectionInvocations: ReadonlyArray<NonNullable<PersistedRunState["connectionInvocations"]>[number]>;
    isRunning: boolean;
  }>,
): WorkflowInspectControllerReturn {
  const {
    workflowId,
    navigation,
    viewContext,
    currentExecutionState,
    displayedWorkflow,
    workflow,
    normalizedConnectionInvocations,
    isRunning,
  } = args;
  const { urlLocation, navigateToLocation } = navigation;
  const selectedRunId = urlLocation.selectedRunId;

  // Re-fetch run detail here (TanStack Query deduplicates with run controller's identical call)
  const selectedRunQuery = useRunQuery(selectedRunId);
  const selectedRunDetailQuery = useRunDetailQuery(selectedRunId);
  const selectedRun = selectedRunQuery.data;
  const selectedRunDetail = selectedRunDetailQuery.data;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState<string | null>(null);
  const [hasManuallySelectedNode, setHasManuallySelectedNode] = useState(false);
  const [propertiesPanelNodeId, setPropertiesPanelNodeId] = useState<string | null>(null);
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
  const [hasManuallyClosedPropertiesPanel, setHasManuallyClosedPropertiesPanel] = useState(false);
  const [selectedMode, setSelectedMode] = useState<InspectorMode>("output");
  const [inspectorFormatByTab, setInspectorFormatByTab] = useState<Readonly<Record<InspectorTab, InspectorFormat>>>({
    input: "json",
    output: "json",
  });
  const [selectedInputPort, setSelectedInputPort] = useState<string | null>(null);
  const [selectedOutputPort, setSelectedOutputPort] = useState<string | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [inspectorHeight, setInspectorHeight] = useState(320);
  const [isInspectorResizing, setIsInspectorResizing] = useState(false);
  const [pendingCredentialEditForNodeId, setPendingCredentialEditForNodeId] = useState<string | null>(null);

  const resizeStartYRef = useRef<number | null>(null);
  const resizeStartHeightRef = useRef(320);
  const previousInspectorSelectionRef = useRef("");
  const previousInspectorHasErrorRef = useRef(false);

  // Reset inspect state when workflowId changes.
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedCanvasNodeId(null);
    setHasManuallySelectedNode(false);
    setPropertiesPanelNodeId(null);
    setIsPropertiesPanelOpen(false);
    setHasManuallyClosedPropertiesPanel(false);
    setSelectedMode("output");
    setInspectorFormatByTab({ input: "json", output: "json" });
    setSelectedInputPort(null);
    setSelectedOutputPort(null);
    setIsPanelCollapsed(false);
    setInspectorHeight(320);
    setIsInspectorResizing(false);
    setPendingCredentialEditForNodeId(null);
    resizeStartYRef.current = null;
    resizeStartHeightRef.current = 320;
    previousInspectorSelectionRef.current = "";
    previousInspectorHasErrorRef.current = false;
  }, [workflowId]);

  // Reset manual selection flag when selectedRunId changes.
  useEffect(() => {
    setHasManuallySelectedNode(false);
  }, [selectedRunId]);

  // Sync selectedNodeId from URL.
  useEffect(() => {
    const id = urlLocation.nodeId;
    if (id !== null) {
      setSelectedNodeId(id);
      setHasManuallySelectedNode(true);
    }
  }, [urlLocation.nodeId]);

  useEffect(() => {
    if (urlLocation.nodeId === null) {
      setHasManuallySelectedNode(false);
    }
  }, [urlLocation.nodeId]);

  // Evict stale URL node when displayed workflow no longer includes it.
  useEffect(() => {
    const nid = urlLocation.nodeId;
    if (!nid || !displayedWorkflow) return;
    if (
      WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow(
        nid,
        displayedWorkflow,
        normalizedConnectionInvocations,
      )
    ) {
      return;
    }
    navigateToLocation({
      selectedRunId: urlLocation.selectedRunId,
      isRunsPaneVisible: urlLocation.isRunsPaneVisible,
      nodeId: null,
    });
  }, [
    displayedWorkflow,
    navigateToLocation,
    normalizedConnectionInvocations,
    urlLocation.isRunsPaneVisible,
    urlLocation.nodeId,
    urlLocation.selectedRunId,
  ]);

  // Clear stale properties panel nodes when workflow structure changes.
  useEffect(() => {
    if (!workflow) return;
    if (propertiesPanelNodeId && !workflow.nodes.some((node) => node.id === propertiesPanelNodeId)) {
      setPropertiesPanelNodeId(null);
      setIsPropertiesPanelOpen(false);
      setHasManuallyClosedPropertiesPanel(false);
    }
    if (selectedCanvasNodeId && !workflow.nodes.some((node) => node.id === selectedCanvasNodeId)) {
      setSelectedCanvasNodeId(null);
    }
  }, [propertiesPanelNodeId, selectedCanvasNodeId, workflow]);

  // Inspector resize listener.
  useEffect(() => {
    if (!isInspectorResizing) return;
    const handleMouseMove = (event: MouseEvent) => {
      if (resizeStartYRef.current === null) return;
      const nextHeight = resizeStartHeightRef.current + (resizeStartYRef.current - event.clientY);
      setInspectorHeight(Math.max(MIN_INSPECTOR_HEIGHT, Math.min(MAX_INSPECTOR_HEIGHT, nextHeight)));
    };
    const handleMouseUp = () => {
      setIsInspectorResizing(false);
      resizeStartYRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isInspectorResizing]);

  const executionNodes = useMemo(
    () =>
      viewContext === "historical-run"
        ? WorkflowDetailPresenter.buildHistoricalExecutionNodes(displayedWorkflow, selectedRunDetail, selectedRun)
        : WorkflowDetailPresenter.buildExecutionNodes(displayedWorkflow, currentExecutionState),
    [currentExecutionState, displayedWorkflow, selectedRun, selectedRunDetail, viewContext],
  );

  const executionTreeData = useMemo(
    () => WorkflowDetailPresenter.buildExecutionTreeData(executionNodes),
    [executionNodes],
  );
  const executionTreeExpandedKeys = useMemo(
    () => WorkflowDetailPresenter.collectExecutionTreeKeys(executionTreeData),
    [executionTreeData],
  );
  const selectedExecutionTreeKey = useMemo(
    () => WorkflowDetailPresenter.resolveExecutionTreeKeyForNodeId(executionNodes, selectedNodeId),
    [executionNodes, selectedNodeId],
  );

  // Auto-focus the most-recently-active node when there's no manual selection.
  useEffect(() => {
    if (!displayedWorkflow?.nodes.length) return;
    if (
      hasManuallySelectedNode &&
      selectedNodeId &&
      WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow(
        selectedNodeId,
        displayedWorkflow,
        normalizedConnectionInvocations,
      )
    ) {
      return;
    }
    if (
      selectedNodeId &&
      (selectedRunDetail?.executionInstances.some((instance) => instance.instanceId === selectedNodeId) ?? false)
    ) {
      return;
    }
    const orderedSnapshots = Object.values(currentExecutionState?.nodeSnapshotsByNodeId ?? {}).sort((left, right) => {
      const leftTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(left) ?? "";
      const rightTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(right) ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    });
    const nextFocusedNodeId =
      (viewContext === "historical-run" ? executionNodes[0]?.node.id : undefined) ??
      orderedSnapshots.find((snapshot) => snapshot.status === "running")?.nodeId ??
      orderedSnapshots.find((snapshot) => snapshot.status === "queued")?.nodeId ??
      orderedSnapshots[0]?.nodeId ??
      executionNodes[0]?.node.id ??
      WorkflowDetailPresenter.getPreferredWorkflowNodeId(displayedWorkflow);
    if (nextFocusedNodeId !== selectedNodeId) {
      setSelectedNodeId(nextFocusedNodeId);
    }
  }, [
    currentExecutionState,
    displayedWorkflow,
    executionNodes,
    hasManuallySelectedNode,
    normalizedConnectionInvocations,
    selectedRunDetail?.executionInstances,
    selectedNodeId,
    viewContext,
  ]);

  const selectedExecutionNode = useMemo(() => {
    const direct = executionNodes.find((executionNode) => executionNode.node.id === selectedNodeId);
    if (direct) return direct;
    const byConnection = executionNodes
      .filter((en) => en.workflowConnectionNodeId === selectedNodeId)
      .sort((left, right) => {
        const leftTs = WorkflowDetailPresenter.getSnapshotTimestamp(left.snapshot) ?? "";
        const rightTs = WorkflowDetailPresenter.getSnapshotTimestamp(right.snapshot) ?? "";
        return rightTs.localeCompare(leftTs);
      });
    return byConnection[0];
  }, [executionNodes, selectedNodeId]);

  const selectedNodeSnapshot = useMemo<NodeExecutionSnapshot | undefined>(() => {
    if (!currentExecutionState || !selectedNodeId) return undefined;
    return selectedExecutionNode?.snapshot ?? currentExecutionState.nodeSnapshotsByNodeId[selectedNodeId];
  }, [currentExecutionState, selectedExecutionNode, selectedNodeId]);

  const selectedWorkflowNode = useMemo(
    () =>
      displayedWorkflow?.nodes.find(
        (node) =>
          node.id ===
          (selectedExecutionNode?.slotNodeId ?? selectedExecutionNode?.workflowConnectionNodeId ?? selectedNodeId),
      ) ?? selectedExecutionNode?.node,
    [displayedWorkflow, selectedExecutionNode, selectedNodeId],
  );

  const selectedPropertiesWorkflowNode = useMemo(
    () =>
      propertiesPanelNodeId ? displayedWorkflow?.nodes.find((node) => node.id === propertiesPanelNodeId) : undefined,
    [displayedWorkflow, propertiesPanelNodeId],
  );

  const inputPortEntries = useMemo(
    () => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.inputsByPort),
    [selectedNodeSnapshot],
  );
  const outputPortEntries = useMemo(
    () => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.outputs),
    [selectedNodeSnapshot],
  );
  const selectedPinnedOutputsByPort = useMemo(
    () => WorkflowDetailPresenter.getPinnedOutputsByPort(currentExecutionState, selectedNodeId),
    [currentExecutionState, selectedNodeId],
  );
  const visibleOutputPortEntries = useMemo(
    () => WorkflowDetailPresenter.applyPinnedOutputsToPortEntries(outputPortEntries, selectedPinnedOutputsByPort),
    [outputPortEntries, selectedPinnedOutputsByPort],
  );
  const selectedPinnedOutput = useMemo(
    () => WorkflowDetailPresenter.getPinnedOutputForPort(currentExecutionState, selectedNodeId, selectedOutputPort),
    [currentExecutionState, selectedNodeId, selectedOutputPort],
  );

  // Auto-select port when entries change.
  useEffect(() => {
    setSelectedInputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(inputPortEntries, current));
  }, [inputPortEntries]);
  useEffect(() => {
    setSelectedOutputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(visibleOutputPortEntries, current));
  }, [visibleOutputPortEntries]);

  // Auto-switch inspector mode on node selection change.
  useEffect(() => {
    const selectionKey = `${selectedRunId ?? ""}:${selectedNodeId ?? ""}`;
    const nextHasError = Boolean(selectedNodeSnapshot?.error);
    if (previousInspectorSelectionRef.current !== selectionKey && selectedMode !== "split") {
      setSelectedMode(WorkflowDetailPresenter.getDefaultInspectorMode(selectedNodeSnapshot));
    } else if (!previousInspectorHasErrorRef.current && nextHasError && selectedMode !== "split") {
      setSelectedMode("output");
    }
    previousInspectorSelectionRef.current = selectionKey;
    previousInspectorHasErrorRef.current = nextHasError;
  }, [selectedMode, selectedNodeId, selectedNodeSnapshot, selectedRunId]);

  const selectedNodeError = selectedNodeSnapshot?.error;
  const selectedInputItems = useMemo(
    () => inputPortEntries.find(([portName]) => portName === selectedInputPort)?.[1],
    [inputPortEntries, selectedInputPort],
  );
  const selectedOutputItems = useMemo(
    () => visibleOutputPortEntries.find(([portName]) => portName === selectedOutputPort)?.[1],
    [selectedOutputPort, visibleOutputPortEntries],
  );
  const inputAttachments = useMemo(
    () => WorkflowDetailPresenter.toAttachmentModels(selectedInputItems, workflowId, viewContext),
    [selectedInputItems, viewContext, workflowId],
  );
  const outputAttachments = useMemo(
    () =>
      WorkflowDetailPresenter.toAttachmentModels(
        selectedNodeError ? undefined : selectedOutputItems,
        workflowId,
        viewContext,
      ),
    [selectedNodeError, selectedOutputItems, viewContext, workflowId],
  );

  // Revert binary format tabs when no attachments are present.
  useEffect(() => {
    setInspectorFormatByTab((current) => {
      const nextInputFormat = current.input === "binary" && inputAttachments.length === 0 ? "json" : current.input;
      const nextOutputFormat = current.output === "binary" && outputAttachments.length === 0 ? "json" : current.output;
      if (nextInputFormat === current.input && nextOutputFormat === current.output) return current;
      return { input: nextInputFormat, output: nextOutputFormat };
    });
  }, [inputAttachments.length, outputAttachments.length]);

  const focusedInvocationIdInPropertiesPanel = useMemo<string | null>(() => {
    if (!propertiesPanelNodeId || !selectedNodeId) return null;
    const matched = normalizedConnectionInvocations.find(
      (inv) => inv.invocationId === selectedNodeId && inv.connectionNodeId === propertiesPanelNodeId,
    );
    return matched ? selectedNodeId : null;
  }, [normalizedConnectionInvocations, propertiesPanelNodeId, selectedNodeId]);

  const inspectorLoadError = useMemo(() => {
    if (viewContext === "historical-run") {
      if (selectedRunQuery.error instanceof Error) return selectedRunQuery.error.message;
      if (selectedRunDetailQuery.error instanceof Error) return selectedRunDetailQuery.error.message;
      return null;
    }
    return null; // debugger overlay errors are surfaced in run controller
  }, [selectedRunDetailQuery.error, selectedRunQuery.error, viewContext]);

  const inputPane = {
    tab: "input" as const,
    format: inspectorFormatByTab.input,
    selectedPort: selectedInputPort,
    portEntries: inputPortEntries,
    value: WorkflowDetailPresenter.toJsonValue(selectedInputItems),
    attachments: inputAttachments,
    emptyLabel: "No input captured yet.",
    showsError: false,
  };
  const outputPane = {
    tab: "output" as const,
    format: inspectorFormatByTab.output,
    selectedPort: selectedOutputPort,
    portEntries: selectedNodeError ? [] : visibleOutputPortEntries,
    value: selectedNodeError ?? WorkflowDetailPresenter.toJsonValue(selectedOutputItems),
    attachments: outputAttachments,
    emptyLabel: selectedNodeError ? "No error for this node." : "No output captured yet.",
    showsError: Boolean(selectedNodeError),
  };

  const selectNode = useCallback(
    (selection: WorkflowExecutionInspectorTreeSelection) => {
      const { inspectorNodeId, canvasNodeId } = selection;
      setHasManuallySelectedNode(true);
      setSelectedNodeId(inspectorNodeId);
      setSelectedCanvasNodeId(canvasNodeId);
      if (canvasNodeId && (isPropertiesPanelOpen || !hasManuallyClosedPropertiesPanel)) {
        setPropertiesPanelNodeId(canvasNodeId);
        setIsPropertiesPanelOpen(true);
      }
      navigateToLocation({
        selectedRunId: urlLocation.selectedRunId,
        isRunsPaneVisible: urlLocation.isRunsPaneVisible,
        nodeId: inspectorNodeId,
      });
    },
    [
      hasManuallyClosedPropertiesPanel,
      isPropertiesPanelOpen,
      navigateToLocation,
      urlLocation.isRunsPaneVisible,
      urlLocation.selectedRunId,
    ],
  );

  const selectCanvasNode = useCallback(
    (nodeId: string) => {
      setHasManuallySelectedNode(true);
      setSelectedCanvasNodeId(nodeId);
      const resolved = WorkflowDetailPresenter.resolveInspectorNodeIdForCanvasPick(
        nodeId,
        displayedWorkflow,
        currentExecutionState?.nodeSnapshotsByNodeId,
        normalizedConnectionInvocations,
        selectedRunDetail,
      );
      setSelectedNodeId(resolved);
      navigateToLocation({
        selectedRunId: urlLocation.selectedRunId,
        isRunsPaneVisible: urlLocation.isRunsPaneVisible,
        nodeId: resolved,
      });
    },
    [
      currentExecutionState?.nodeSnapshotsByNodeId,
      displayedWorkflow,
      navigateToLocation,
      normalizedConnectionInvocations,
      selectedRunDetail,
      urlLocation.isRunsPaneVisible,
      urlLocation.selectedRunId,
    ],
  );

  const selectNodeAndOutputPort = useCallback(
    (nodeId: string, outputPort: string) => {
      setHasManuallySelectedNode(true);
      setSelectedNodeId(nodeId);
      setSelectedOutputPort(outputPort);
      navigateToLocation({
        selectedRunId: urlLocation.selectedRunId,
        isRunsPaneVisible: urlLocation.isRunsPaneVisible,
        nodeId,
      });
    },
    [navigateToLocation, urlLocation.isRunsPaneVisible, urlLocation.selectedRunId],
  );

  const selectNodeForRun = useCallback(
    (nodeId: string) => {
      setHasManuallySelectedNode(true);
      setSelectedNodeId(nodeId);
      navigateToLocation({
        selectedRunId: urlLocation.selectedRunId,
        isRunsPaneVisible: urlLocation.isRunsPaneVisible,
        nodeId,
      });
    },
    [navigateToLocation, urlLocation.isRunsPaneVisible, urlLocation.selectedRunId],
  );

  const openPropertiesPanelForNode = useCallback((nodeId: string) => {
    setHasManuallyClosedPropertiesPanel(false);
    setPropertiesPanelNodeId(nodeId);
    setIsPropertiesPanelOpen(true);
  }, []);

  const requestOpenCredentialEditForNode = useCallback((nodeId: string) => {
    setPendingCredentialEditForNodeId(nodeId);
    setHasManuallyClosedPropertiesPanel(false);
    setPropertiesPanelNodeId(nodeId);
    setIsPropertiesPanelOpen(true);
  }, []);

  const consumePendingCredentialEditRequest = useCallback(() => {
    setPendingCredentialEditForNodeId(null);
  }, []);

  const closePropertiesPanel = useCallback(() => {
    setHasManuallyClosedPropertiesPanel(true);
    setIsPropertiesPanelOpen(false);
    setPropertiesPanelNodeId(null);
    setPendingCredentialEditForNodeId(null);
  }, []);

  const selectInvocationInPropertiesPanel = useCallback(
    (invocationId: string) => {
      if (!propertiesPanelNodeId) return;
      selectNode({ inspectorNodeId: invocationId, canvasNodeId: propertiesPanelNodeId });
    },
    [propertiesPanelNodeId, selectNode],
  );

  return {
    selectedNodeId,
    selectedCanvasNodeId,
    propertiesPanelNodeId,
    isPropertiesPanelOpen,
    selectedPropertiesWorkflowNode,
    selectCanvasNode,
    selectNodeAndOutputPort,
    selectNodeForRun,
    openPropertiesPanelForNode,
    requestOpenCredentialEditForNode,
    consumePendingCredentialEditRequest,
    closePropertiesPanel,
    selectInvocationInPropertiesPanel,
    pendingCredentialEditForNodeId,
    focusedInvocationIdInPropertiesPanel,
    selectedOutputPort,
    isPanelCollapsed,
    inspectorHeight,
    startInspectorResize: (clientY) => {
      if (isPanelCollapsed) return;
      resizeStartYRef.current = clientY;
      resizeStartHeightRef.current = inspectorHeight;
      setIsInspectorResizing(true);
    },
    toggleInspectorPanel: () => setIsPanelCollapsed((value) => !value),
    inspectorModel: {
      workflowId,
      viewContext,
      selectedRunId,
      isLoading:
        viewContext === "historical-run" ? selectedRunQuery.isLoading || selectedRunDetailQuery.isLoading : false,
      loadError: inspectorLoadError,
      selectedRun,
      selectedRunDetail,
      selectedNodeId,
      selectedExecutionInstanceId:
        selectedNodeId &&
        (selectedRunDetail?.executionInstances.some((instance) => instance.instanceId === selectedNodeId) ??
          selectedRun?.connectionInvocations?.some((i) => i.invocationId === selectedNodeId) ??
          false)
          ? selectedNodeId
          : null,
      selectedNodeSnapshot,
      selectedWorkflowNode,
      selectedPinnedOutput,
      selectedNodeError,
      selectedMode,
      inputPane,
      outputPane,
      executionTreeData,
      executionTreeExpandedKeys,
      selectedExecutionTreeKey,
      nodeActions: {
        viewContext,
        isRunning,
        canEditOutput: viewContext === "live-workflow" && Boolean(selectedNodeId),
        canClearPinnedOutput: viewContext === "live-workflow" && Boolean(selectedNodeId && selectedPinnedOutput),
      },
    },
    inspectorFormatting: {
      formatDateTime: WorkflowDetailPresenter.formatDateTime,
      formatDurationLabel: WorkflowDetailPresenter.formatDurationLabel,
      getNodeDisplayName: WorkflowDetailPresenter.getNodeDisplayName,
      getSnapshotTimestamp: WorkflowDetailPresenter.getSnapshotTimestamp,
      getErrorHeadline: WorkflowDetailPresenter.getErrorHeadline,
      getErrorStack: WorkflowDetailPresenter.getErrorStack,
      getErrorClipboardText: WorkflowDetailPresenter.getErrorClipboardText,
    },
    inspectorActions: {
      onSelectNode: selectNode,
      onEditSelectedOutput: NO_OP_VOID_ACTION,
      onClearPinnedOutput: NO_OP_VOID_ACTION,
      onSelectMode: setSelectedMode,
      onSelectFormat: (tab, format) => setInspectorFormatByTab((current) => ({ ...current, [tab]: format })),
      onSelectInputPort: setSelectedInputPort,
      onSelectOutputPort: setSelectedOutputPort,
    },
  };
}

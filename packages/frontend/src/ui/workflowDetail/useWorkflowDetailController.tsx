import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRunQuery,
  useWorkflowQuery,
  useWorkflowRealtimeSubscription,
  useWorkflowRunsQuery,
  type NodeExecutionSnapshot,
  type PersistedRunState,
  type RunSummary,
  type WorkflowDto,
} from "../realtime/realtime";
import type {
  InspectorFormat,
  InspectorMode,
  InspectorTab,
  JsonEditorState,
  WorkflowExecutionInspectorActions,
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
  WorkflowRunsSidebarActions,
  WorkflowRunsSidebarFormatting,
  WorkflowRunsSidebarModel,
} from "./workflowDetailTypes";
import { WorkflowDetailPresenter, type RunWorkflowRequest } from "./WorkflowDetailPresenter";

type WorkflowDetailControllerResult = Readonly<{
  displayedWorkflow: WorkflowDto | undefined;
  pinnedNodeIds: ReadonlySet<string>;
  selectedRun: PersistedRunState | undefined;
  sidebarModel: WorkflowRunsSidebarModel;
  sidebarFormatting: WorkflowRunsSidebarFormatting;
  sidebarActions: WorkflowRunsSidebarActions;
  inspectorModel: WorkflowExecutionInspectorModel;
  inspectorFormatting: WorkflowExecutionInspectorFormatting;
  inspectorActions: WorkflowExecutionInspectorActions;
  selectedNodeId: string | null;
  selectCanvasNode: (nodeId: string) => void;
  isPanelCollapsed: boolean;
  inspectorHeight: number;
  startInspectorResize: (clientY: number) => void;
  toggleInspectorPanel: () => void;
  jsonEditorState: JsonEditorState | null;
  closeJsonEditor: () => void;
  saveJsonEditor: (value: string) => void;
}>;

export function useWorkflowDetailController(args: Readonly<{ workflowId: string; initialWorkflow?: WorkflowDto }>): WorkflowDetailControllerResult {
  const MIN_INSPECTOR_HEIGHT = 240;
  const MAX_INSPECTOR_HEIGHT = 640;
  const { workflowId, initialWorkflow } = args;
  const queryClient = useQueryClient();
  const workflowQuery = useWorkflowQuery(workflowId, initialWorkflow);
  const runsQuery = useWorkflowRunsQuery(workflowId);
  useWorkflowRealtimeSubscription(workflowId);

  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingSelectedRun, setPendingSelectedRun] = useState<RunSummary | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasManuallySelectedNode, setHasManuallySelectedNode] = useState(false);
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
  const [jsonEditorState, setJsonEditorState] = useState<JsonEditorState | null>(null);
  const resizeStartYRef = useRef<number | null>(null);
  const resizeStartHeightRef = useRef(320);
  const previousInspectorSelectionRef = useRef("");
  const previousInspectorHasErrorRef = useRef(false);

  const workflow = workflowQuery.data;
  const runs = runsQuery.data;
  const selectedRunQuery = useRunQuery(selectedRunId);
  const selectedRun = selectedRunQuery.data;
  const displayedWorkflow = useMemo(() => WorkflowDetailPresenter.workflowFromSnapshot(selectedRun?.workflowSnapshot, workflow), [selectedRun, workflow]);
  const selectedPinnedInput = useMemo(() => WorkflowDetailPresenter.getPinnedInput(selectedRun, selectedNodeId), [selectedNodeId, selectedRun]);
  const pinnedNodeIds = useMemo(
    () => new Set(Object.keys(selectedRun?.mutableState?.nodesById ?? {}).filter((nodeId) => Boolean(selectedRun?.mutableState?.nodesById?.[nodeId]?.pinnedInput))),
    [selectedRun],
  );
  const displayedRuns = useMemo(() => {
    if (!pendingSelectedRun) {
      return runs;
    }
    if (!runs) {
      return [pendingSelectedRun];
    }
    if (runs.some((run) => run.runId === pendingSelectedRun.runId)) {
      return runs;
    }
    return [pendingSelectedRun, ...runs];
  }, [pendingSelectedRun, runs]);

  useEffect(() => {
    if (pendingSelectedRun && runs?.some((run) => run.runId === pendingSelectedRun.runId)) {
      setPendingSelectedRun(null);
    }
  }, [pendingSelectedRun, runs]);

  useEffect(() => {
    if (!selectedRunId && displayedRuns?.length) {
      setSelectedRunId(displayedRuns[0]!.runId);
    }
  }, [displayedRuns, selectedRunId]);

  useEffect(() => {
    if (selectedRunId && displayedRuns?.some((run) => run.runId === selectedRunId)) {
      return;
    }
    setSelectedRunId(displayedRuns?.[0]?.runId ?? null);
  }, [displayedRuns, selectedRunId]);

  useEffect(() => {
    setHasManuallySelectedNode(false);
  }, [selectedRunId]);

  useEffect(() => {
    setSelectedRunId(null);
    setPendingSelectedRun(null);
    setSelectedNodeId(null);
    setHasManuallySelectedNode(false);
    setSelectedMode("output");
    setInspectorFormatByTab({
      input: "json",
      output: "json",
    });
    setSelectedInputPort(null);
    setSelectedOutputPort(null);
    setIsPanelCollapsed(false);
    setInspectorHeight(320);
    setIsInspectorResizing(false);
    setJsonEditorState(null);
    resizeStartYRef.current = null;
    resizeStartHeightRef.current = 320;
    previousInspectorSelectionRef.current = "";
    previousInspectorHasErrorRef.current = false;
  }, [workflowId]);

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
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isInspectorResizing]);

  const executionNodes = useMemo(() => WorkflowDetailPresenter.buildExecutionNodes(displayedWorkflow, selectedRun), [displayedWorkflow, selectedRun]);
  const executionTreeData = useMemo(() => WorkflowDetailPresenter.buildExecutionTreeData(executionNodes), [executionNodes]);
  const executionTreeExpandedKeys = useMemo(() => WorkflowDetailPresenter.collectExecutionTreeKeys(executionTreeData), [executionTreeData]);

  useEffect(() => {
    if (!displayedWorkflow?.nodes.length) return;
    if (hasManuallySelectedNode && selectedNodeId && executionNodes.some((executionNode) => executionNode.node.id === selectedNodeId)) return;
    const orderedSnapshots = Object.values(selectedRun?.nodeSnapshotsByNodeId ?? {}).sort((left, right) => {
      const leftTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(left) ?? "";
      const rightTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(right) ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    });
    const nextFocusedNodeId =
      orderedSnapshots.find((snapshot) => snapshot.status === "running")?.nodeId ??
      orderedSnapshots.find((snapshot) => snapshot.status === "queued")?.nodeId ??
      orderedSnapshots[0]?.nodeId ??
      executionNodes[0]?.node.id ??
      displayedWorkflow.nodes[0]!.id;
    if (nextFocusedNodeId !== selectedNodeId) {
      setSelectedNodeId(nextFocusedNodeId);
    }
  }, [displayedWorkflow, executionNodes, hasManuallySelectedNode, selectedNodeId, selectedRun]);

  const selectedExecutionNode = useMemo(
    () => executionNodes.find((executionNode) => executionNode.node.id === selectedNodeId),
    [executionNodes, selectedNodeId],
  );
  const selectedNodeSnapshot = useMemo<NodeExecutionSnapshot | undefined>(() => {
    if (!selectedRun || !selectedNodeId) return undefined;
    return selectedExecutionNode?.snapshot ?? selectedRun.nodeSnapshotsByNodeId[selectedNodeId];
  }, [selectedExecutionNode, selectedNodeId, selectedRun]);
  const selectedWorkflowNode = useMemo(
    () => selectedExecutionNode?.node ?? displayedWorkflow?.nodes.find((node) => node.id === selectedNodeId),
    [displayedWorkflow, selectedExecutionNode, selectedNodeId],
  );
  const inputPortEntries = useMemo(() => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.inputsByPort), [selectedNodeSnapshot]);
  const outputPortEntries = useMemo(() => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.outputs), [selectedNodeSnapshot]);

  useEffect(() => {
    setSelectedInputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(inputPortEntries, current));
  }, [inputPortEntries]);

  useEffect(() => {
    setSelectedOutputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(outputPortEntries, current));
  }, [outputPortEntries]);

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

  const applyPendingRunResult = useCallback(
    (result: { runId: string; workflowId: string; status: string; startedAt?: string; state: PersistedRunState | null }) => {
      if (result.state) {
        queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(result.runId), result.state);
        queryClient.setQueryData(
          WorkflowDetailPresenter.getWorkflowRunsQueryKey(result.workflowId),
          (existing: ReadonlyArray<RunSummary> | undefined) =>
            WorkflowDetailPresenter.mergeRunSummaryList(existing, WorkflowDetailPresenter.toRunSummary(result.state!)),
        );
      }
      setSelectedRunId(result.runId);
      setPendingSelectedRun(
        result.state
          ? WorkflowDetailPresenter.toRunSummary(result.state)
          : {
              runId: result.runId,
              workflowId: result.workflowId,
              status: result.status,
              startedAt: result.startedAt ?? new Date().toISOString(),
            },
      );
    },
    [queryClient],
  );

  const runExecution = useCallback(
    (request: RunWorkflowRequest = {}) => {
      setIsRunning(true);
      setError(null);
      void WorkflowDetailPresenter.runWorkflow(workflowId, workflow, request)
        .then((result) => {
          applyPendingRunResult(result);
          setHasManuallySelectedNode(false);
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => setIsRunning(false));
    },
    [applyPendingRunResult, workflow, workflowId],
  );

  const onRun = useCallback(() => {
    runExecution();
  }, [runExecution]);

  const onRunToHere = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    runExecution({
      stopAt: selectedNodeId,
      mode: "manual",
      sourceRunId: selectedRunId ?? undefined,
    });
  }, [runExecution, selectedNodeId, selectedRunId]);

  const onDebugHere = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    runExecution({
      stopAt: selectedNodeId,
      mode: "debug",
      sourceRunId: selectedRunId ?? undefined,
    });
  }, [runExecution, selectedNodeId, selectedRunId]);

  const onRunFromMutableExecution = useCallback(() => {
    if (!selectedRunId || !selectedNodeId) {
      return;
    }
    setIsRunning(true);
    setError(null);
    void WorkflowDetailPresenter.runNode(selectedRunId, selectedNodeId, undefined, "manual")
      .then((result) => applyPendingRunResult(result))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setIsRunning(false));
  }, [applyPendingRunResult, selectedNodeId, selectedRunId]);

  const onPinInput = useCallback(() => {
    if (!selectedRunId || !selectedNodeId) {
      return;
    }
    setJsonEditorState({
      mode: "pin-input",
      title: `Pin input for ${WorkflowDetailPresenter.getNodeDisplayName(selectedWorkflowNode, selectedNodeId)}`,
      value: WorkflowDetailPresenter.toEditableJson(selectedPinnedInput ?? selectedNodeSnapshot?.inputsByPort?.in),
    });
  }, [selectedNodeId, selectedNodeSnapshot, selectedPinnedInput, selectedRunId, selectedWorkflowNode]);

  const onDebugMutableExecution = useCallback(() => {
    if (!selectedRunId || !selectedNodeId) {
      return;
    }
    setJsonEditorState({
      mode: "debug-input",
      title: `Debug input for ${WorkflowDetailPresenter.getNodeDisplayName(selectedWorkflowNode, selectedNodeId)}`,
      value: WorkflowDetailPresenter.toEditableJson(
        selectedRun?.mutableState?.nodesById?.[selectedNodeId]?.lastDebugInput ?? selectedPinnedInput ?? selectedNodeSnapshot?.inputsByPort?.in,
      ),
    });
  }, [selectedNodeId, selectedNodeSnapshot, selectedPinnedInput, selectedRun, selectedRunId, selectedWorkflowNode]);

  const onEditWorkflowSnapshot = useCallback(() => {
    if (!selectedRun?.workflowSnapshot) {
      return;
    }
    setJsonEditorState({
      mode: "workflow-snapshot",
      title: "Edit workflow snapshot JSON",
      value: JSON.stringify(selectedRun.workflowSnapshot, null, 2),
    });
  }, [selectedRun]);

  const onClearPin = useCallback(() => {
    if (!selectedRunId || !selectedNodeId) {
      return;
    }
    setError(null);
    void WorkflowDetailPresenter.updatePinnedInput(selectedRunId, selectedNodeId, undefined)
      .then((state) => {
        queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(state.runId), state);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [queryClient, selectedNodeId, selectedRunId]);

  const saveJsonEditor = useCallback(
    (value: string) => {
      if (!jsonEditorState) {
        return;
      }
      if (jsonEditorState.mode === "workflow-snapshot") {
        if (!selectedRunId) return;
        void WorkflowDetailPresenter.updateWorkflowSnapshot(selectedRunId, WorkflowDetailPresenter.parseWorkflowSnapshot(value))
          .then((state) => {
            queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(state.runId), state);
            setJsonEditorState(null);
          })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
        return;
      }
      if (!selectedRunId || !selectedNodeId) {
        return;
      }
      if (jsonEditorState.mode === "pin-input") {
        void WorkflowDetailPresenter.updatePinnedInput(selectedRunId, selectedNodeId, WorkflowDetailPresenter.parseEditableItems(value))
          .then((state) => {
            queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(state.runId), state);
            setJsonEditorState(null);
          })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
        return;
      }
      if (jsonEditorState.mode === "debug-input") {
        setIsRunning(true);
        setError(null);
        void WorkflowDetailPresenter.runNode(selectedRunId, selectedNodeId, WorkflowDetailPresenter.parseEditableItems(value), "debug")
          .then((result) => {
            applyPendingRunResult(result);
            setJsonEditorState(null);
          })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
          .finally(() => setIsRunning(false));
        return;
      }
      void WorkflowDetailPresenter.updateWorkflowSnapshot(selectedRunId, WorkflowDetailPresenter.parseWorkflowSnapshot(value))
        .then((state) => {
          queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(state.runId), state);
          setJsonEditorState(null);
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    },
    [applyPendingRunResult, jsonEditorState, queryClient, selectedNodeId, selectedRunId],
  );

  const workflowError = workflowQuery.error instanceof Error ? workflowQuery.error.message : null;
  const runsError = runsQuery.error instanceof Error ? runsQuery.error.message : null;
  const isMutableSelectedRun = WorkflowDetailPresenter.isMutableExecution(selectedRun);
  const selectedInputItems = useMemo(() => inputPortEntries.find(([portName]) => portName === selectedInputPort)?.[1], [inputPortEntries, selectedInputPort]);
  const selectedOutputItems = useMemo(() => outputPortEntries.find(([portName]) => portName === selectedOutputPort)?.[1], [outputPortEntries, selectedOutputPort]);
  const selectedNodeError = selectedNodeSnapshot?.error;
  const inputPane = {
    tab: "input" as const,
    format: inspectorFormatByTab.input,
    selectedPort: selectedInputPort,
    portEntries: inputPortEntries,
    value: WorkflowDetailPresenter.toJsonValue(selectedInputItems),
    emptyLabel: "No input captured yet.",
    showsError: false,
  };
  const outputPane = {
    tab: "output" as const,
    format: inspectorFormatByTab.output,
    selectedPort: selectedOutputPort,
    portEntries: selectedNodeError ? [] : outputPortEntries,
    value: selectedNodeError ?? WorkflowDetailPresenter.toJsonValue(selectedOutputItems),
    emptyLabel: selectedNodeError ? "No error for this node." : "No output captured yet.",
    showsError: Boolean(selectedNodeError),
  };

  const selectNode = useCallback((nodeId: string) => {
    setHasManuallySelectedNode(true);
    setSelectedNodeId(nodeId);
  }, []);

  return {
    displayedWorkflow,
    pinnedNodeIds,
    selectedRun,
    sidebarModel: {
      workflowId,
      displayedWorkflow,
      workflow,
      workflowError,
      error,
      displayedRuns,
      runsError,
      selectedRunId,
      selectedRun,
      isMutableSelectedRun,
      isRunning,
      selectedNodeId,
      selectedPinnedInput,
    },
    sidebarFormatting: {
      formatDateTime: WorkflowDetailPresenter.formatDateTime,
      getExecutionModeLabel: WorkflowDetailPresenter.getExecutionModeLabel,
    },
    sidebarActions: {
      onSelectRun: setSelectedRunId,
      onRun,
      onRunToHere,
      onDebugHere,
      onRunFromMutableExecution,
      onDebugMutableExecution,
      onPinInput,
      onClearPin,
      onEditWorkflowSnapshot,
    },
    inspectorModel: {
      selectedRunId,
      isLoading: selectedRunQuery.isLoading,
      loadError: selectedRunQuery.error instanceof Error ? selectedRunQuery.error.message : null,
      selectedRun,
      selectedNodeId,
      selectedNodeSnapshot,
      selectedWorkflowNode,
      selectedPinnedInput,
      selectedNodeError,
      selectedMode,
      inputPane,
      outputPane,
      executionTreeData,
      executionTreeExpandedKeys,
    },
    inspectorFormatting: {
      formatDateTime: WorkflowDetailPresenter.formatDateTime,
      getNodeDisplayName: WorkflowDetailPresenter.getNodeDisplayName,
      getSnapshotTimestamp: WorkflowDetailPresenter.getSnapshotTimestamp,
      getErrorHeadline: WorkflowDetailPresenter.getErrorHeadline,
      getErrorStack: WorkflowDetailPresenter.getErrorStack,
      getErrorClipboardText: WorkflowDetailPresenter.getErrorClipboardText,
    },
    inspectorActions: {
      onSelectNode: selectNode,
      onSelectMode: setSelectedMode,
      onSelectFormat: (tab, format) =>
        setInspectorFormatByTab((current) => ({
          ...current,
          [tab]: format,
        })),
      onSelectInputPort: setSelectedInputPort,
      onSelectOutputPort: setSelectedOutputPort,
    },
    selectedNodeId,
    selectCanvasNode: selectNode,
    isPanelCollapsed,
    inspectorHeight,
    startInspectorResize: (clientY) => {
      if (isPanelCollapsed) return;
      resizeStartYRef.current = clientY;
      resizeStartHeightRef.current = inspectorHeight;
      setIsInspectorResizing(true);
    },
    toggleInspectorPanel: () => setIsPanelCollapsed((value) => !value),
    jsonEditorState,
    closeJsonEditor: () => setJsonEditorState(null),
    saveJsonEditor,
  };
}

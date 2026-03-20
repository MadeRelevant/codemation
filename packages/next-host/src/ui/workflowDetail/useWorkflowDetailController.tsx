import { useQueryClient } from "@tanstack/react-query";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
useRunQuery,
useWorkflowDebuggerOverlayQuery,
useWorkflowDevBuildStateQuery,
useWorkflowQuery,
useWorkflowRealtimeConnectionState,
useWorkflowRealtimeSubscription,
useWorkflowRunsQuery,
type Items,
type NodeExecutionSnapshot,
type PersistedRunState,
type RunSummary,
type WorkflowDevBuildState,
type WorkflowDto,
} from "../realtime/realtime";
import { WorkflowDetailPresenter,type RunWorkflowRequest } from "./WorkflowDetailPresenter";
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

export type WorkflowDetailControllerResult = Readonly<{
  displayedWorkflow: WorkflowDto | undefined;
  displayedNodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  pinnedNodeIds: ReadonlySet<string>;
  isLiveWorkflowView: boolean;
  isRunsPaneVisible: boolean;
  isRunning: boolean;
  workflowDevBuildState: WorkflowDevBuildState;
  isRealtimeConnected: boolean;
  canCopySelectedRunToLive: boolean;
  selectedRun: PersistedRunState | undefined;
  sidebarModel: WorkflowRunsSidebarModel;
  sidebarFormatting: WorkflowRunsSidebarFormatting;
  sidebarActions: WorkflowRunsSidebarActions;
  inspectorModel: WorkflowExecutionInspectorModel;
  inspectorFormatting: WorkflowExecutionInspectorFormatting;
  inspectorActions: WorkflowExecutionInspectorActions;
  selectedNodeId: string | null;
  propertiesPanelNodeId: string | null;
  isPropertiesPanelOpen: boolean;
  selectedPropertiesWorkflowNode: WorkflowDto["nodes"][number] | undefined;
  selectCanvasNode: (nodeId: string) => void;
  openPropertiesPanelForNode: (nodeId: string) => void;
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
  saveJsonEditor: (value: string) => void;
}>;

export function useWorkflowDetailController(args: Readonly<{ workflowId: string; initialWorkflow?: WorkflowDto }>): WorkflowDetailControllerResult {
  const MIN_INSPECTOR_HEIGHT = 240;
  const MAX_INSPECTOR_HEIGHT = 640;
  const { workflowId, initialWorkflow } = args;
  const queryClient = useQueryClient();
  const workflowQuery = useWorkflowQuery(workflowId, initialWorkflow);
  const runsQuery = useWorkflowRunsQuery(workflowId);
  const debuggerOverlayQuery = useWorkflowDebuggerOverlayQuery(workflowId);
  const workflowDevBuildStateQuery = useWorkflowDevBuildStateQuery(workflowId);
  const isRealtimeConnected = useWorkflowRealtimeConnectionState();
  useWorkflowRealtimeSubscription(workflowId);

  const [error, setError] = useState<string | null>(null);
  const [isRunRequestPending, setIsRunRequestPending] = useState(false);
  const [pendingTriggerFetchSnapshot, setPendingTriggerFetchSnapshot] = useState<NodeExecutionSnapshot | null>(null);
  const [isRunsPaneVisible, setIsRunsPaneVisible] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeLiveRunId, setActiveLiveRunId] = useState<string | null>(null);
  const [pendingSelectedRun, setPendingSelectedRun] = useState<RunSummary | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasManuallySelectedNode, setHasManuallySelectedNode] = useState(false);
  const [propertiesPanelNodeId, setPropertiesPanelNodeId] = useState<string | null>(null);
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
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
  const runRequestInFlightRef = useRef(false);
  const previousLiveWorkflowSignatureRef = useRef<string | null>(null);

  const workflow = workflowQuery.data;
  const workflowDevBuildState = workflowDevBuildStateQuery.data ?? {
    state: "idle",
    updatedAt: new Date(0).toISOString(),
  };
  const workflowDevBuildStateQueryKey = useMemo(() => ["workflow-dev-build-state", workflowId] as const, [workflowId]);
  const liveWorkflowSignature = useMemo(() => WorkflowDetailPresenter.createWorkflowStructureSignature(workflow), [workflow]);
  const runs = runsQuery.data;
  const selectedRunQuery = useRunQuery(selectedRunId);
  const selectedRun = selectedRunQuery.data;
  const activeLiveRunQuery = useRunQuery(activeLiveRunId);
  const activeLiveRun = activeLiveRunQuery.data;
  const debuggerOverlay = debuggerOverlayQuery.data;
  const viewContext = selectedRunId ? "historical-run" : "live-workflow";
  const liveExecutionState = useMemo(() => {
    const overlayCurrentState = debuggerOverlay?.currentState;
    const baseLiveExecutionState =
      !activeLiveRunId
        ? overlayCurrentState
        : !activeLiveRun
          ? ({
              outputsByNode: {},
              nodeSnapshotsByNodeId: {},
              mutableState: overlayCurrentState?.mutableState,
            } satisfies NonNullable<NonNullable<typeof debuggerOverlay>["currentState"]>)
          : ({
              outputsByNode: activeLiveRun.outputsByNode,
              nodeSnapshotsByNodeId: activeLiveRun.nodeSnapshotsByNodeId,
              mutableState: overlayCurrentState?.mutableState ?? activeLiveRun.mutableState,
            } satisfies NonNullable<NonNullable<typeof debuggerOverlay>["currentState"]>);
    const reconciledBaseLiveExecutionState = WorkflowDetailPresenter.reconcileCurrentStateWithWorkflow(baseLiveExecutionState, workflow);
    if (!pendingTriggerFetchSnapshot || activeLiveRunId) {
      return reconciledBaseLiveExecutionState;
    }
    if (!workflow?.nodes.some((node) => node.id === pendingTriggerFetchSnapshot.nodeId)) {
      return reconciledBaseLiveExecutionState;
    }
    return {
      ...(reconciledBaseLiveExecutionState ?? {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        mutableState: overlayCurrentState?.mutableState,
      }),
      nodeSnapshotsByNodeId: {
        ...(reconciledBaseLiveExecutionState?.nodeSnapshotsByNodeId ?? {}),
        [pendingTriggerFetchSnapshot.nodeId]: pendingTriggerFetchSnapshot,
      },
    } satisfies NonNullable<NonNullable<typeof debuggerOverlay>["currentState"]>;
  }, [activeLiveRun, activeLiveRunId, debuggerOverlay, pendingTriggerFetchSnapshot, workflow]);
  const displayedWorkflow = useMemo(
    () => WorkflowDetailPresenter.resolveViewedWorkflow({ selectedRun, liveWorkflow: workflow }),
    [selectedRun, workflow],
  );
  const currentExecutionState = useMemo(
    () => (viewContext === "live-workflow" ? liveExecutionState : selectedRun),
    [liveExecutionState, selectedRun, viewContext],
  );
  const isActiveLiveRunPending = useMemo(
    () =>
      Boolean(
        activeLiveRunId &&
          (!activeLiveRun ||
            activeLiveRun.status === "pending" ||
            activeLiveRun.pending ||
            Object.values(activeLiveRun.nodeSnapshotsByNodeId).some(
              (snapshot) => snapshot.status === "queued" || snapshot.status === "running",
            )),
      ),
    [activeLiveRun, activeLiveRunId],
  );
  const isRunning = isRunRequestPending || (viewContext === "live-workflow" && isActiveLiveRunPending);

  const selectedPinnedOutput = useMemo(
    () => WorkflowDetailPresenter.getPinnedOutput(currentExecutionState, selectedNodeId),
    [currentExecutionState, selectedNodeId],
  );
  const pinnedNodeIds = useMemo(
    () =>
      new Set(
        Object.keys(currentExecutionState?.mutableState?.nodesById ?? {}).filter((nodeId) =>
          Boolean(currentExecutionState?.mutableState?.nodesById?.[nodeId]?.pinnedOutputsByPort?.main),
        ),
      ),
    [currentExecutionState],
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
    if (!selectedRunId) {
      return;
    }
    if (displayedRuns?.some((run) => run.runId === selectedRunId)) {
      return;
    }
    setSelectedRunId(null);
  }, [displayedRuns, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }
    setIsRunsPaneVisible(true);
  }, [selectedRunId]);

  useEffect(() => {
    setHasManuallySelectedNode(false);
  }, [selectedRunId]);

  useEffect(() => {
    setIsRunsPaneVisible(false);
    setSelectedRunId(null);
    setActiveLiveRunId(null);
    setPendingSelectedRun(null);
    setSelectedNodeId(null);
    setHasManuallySelectedNode(false);
    setPropertiesPanelNodeId(null);
    setIsPropertiesPanelOpen(false);
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
    setPendingTriggerFetchSnapshot(null);
    setJsonEditorState(null);
    resizeStartYRef.current = null;
    resizeStartHeightRef.current = 320;
    previousInspectorSelectionRef.current = "";
    previousInspectorHasErrorRef.current = false;
  }, [workflowId]);

  useEffect(() => {
    if (!workflow) {
      return;
    }
    const previousSignature = previousLiveWorkflowSignatureRef.current;
    previousLiveWorkflowSignatureRef.current = liveWorkflowSignature;
    if (previousSignature === null || previousSignature === liveWorkflowSignature || selectedRunId) {
      return;
    }
    queryClient.setQueryData(
      WorkflowDetailPresenter.getWorkflowDebuggerOverlayQueryKey(workflowId),
      (existing: typeof debuggerOverlay | undefined) => {
        if (!existing) {
          return existing;
        }
        return {
          ...existing,
          currentState: WorkflowDetailPresenter.reconcileCurrentStateWithWorkflow(existing.currentState, workflow) ?? existing.currentState,
        };
      },
    );
    setActiveLiveRunId(null);
    setPendingSelectedRun(null);
    setPendingTriggerFetchSnapshot(null);
    setJsonEditorState(null);
    if (selectedNodeId && !workflow.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setHasManuallySelectedNode(false);
    }
    if (propertiesPanelNodeId && !workflow.nodes.some((node) => node.id === propertiesPanelNodeId)) {
      setPropertiesPanelNodeId(null);
      setIsPropertiesPanelOpen(false);
    }
  }, [debuggerOverlay, liveWorkflowSignature, propertiesPanelNodeId, queryClient, selectedNodeId, selectedRunId, workflow, workflowId]);

  useEffect(() => {
    if (workflowDevBuildState.state !== "building" || !workflowDevBuildState.awaitingWorkflowRefreshAt) {
      return;
    }
    if (workflowQuery.isFetching) {
      return;
    }
    const workflowRefreshRequestedAt = Date.parse(workflowDevBuildState.awaitingWorkflowRefreshAt);
    if (!Number.isFinite(workflowRefreshRequestedAt) || workflowQuery.dataUpdatedAt < workflowRefreshRequestedAt) {
      return;
    }
    queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey, (existing) => {
      if (!existing || existing.state !== "building") {
        return existing;
      }
      return {
        state: "idle",
        updatedAt: new Date().toISOString(),
        buildVersion: existing.buildVersion,
      };
    });
  }, [
    queryClient,
    workflowDevBuildState.awaitingWorkflowRefreshAt,
    workflowDevBuildStateQueryKey,
    workflowDevBuildState.state,
    workflowQuery.dataUpdatedAt,
    workflowQuery.isFetching,
  ]);

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

  const executionNodes = useMemo(
    () => WorkflowDetailPresenter.buildExecutionNodes(displayedWorkflow, currentExecutionState),
    [currentExecutionState, displayedWorkflow],
  );
  const executionTreeData = useMemo(() => WorkflowDetailPresenter.buildExecutionTreeData(executionNodes), [executionNodes]);
  const executionTreeExpandedKeys = useMemo(() => WorkflowDetailPresenter.collectExecutionTreeKeys(executionTreeData), [executionTreeData]);

  useEffect(() => {
    if (!displayedWorkflow?.nodes.length) return;
    if (hasManuallySelectedNode && selectedNodeId && executionNodes.some((executionNode) => executionNode.node.id === selectedNodeId)) return;
    const orderedSnapshots = Object.values(currentExecutionState?.nodeSnapshotsByNodeId ?? {}).sort((left, right) => {
      const leftTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(left) ?? "";
      const rightTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(right) ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    });
    const nextFocusedNodeId =
      orderedSnapshots.find((snapshot) => snapshot.status === "running")?.nodeId ??
      orderedSnapshots.find((snapshot) => snapshot.status === "queued")?.nodeId ??
      orderedSnapshots[0]?.nodeId ??
      executionNodes[0]?.node.id ??
      WorkflowDetailPresenter.getPreferredWorkflowNodeId(displayedWorkflow);
    if (nextFocusedNodeId !== selectedNodeId) {
      setSelectedNodeId(nextFocusedNodeId);
    }
  }, [currentExecutionState, displayedWorkflow, executionNodes, hasManuallySelectedNode, selectedNodeId]);

  const selectedExecutionNode = useMemo(
    () => executionNodes.find((executionNode) => executionNode.node.id === selectedNodeId),
    [executionNodes, selectedNodeId],
  );
  const selectedNodeSnapshot = useMemo<NodeExecutionSnapshot | undefined>(() => {
    if (!currentExecutionState || !selectedNodeId) return undefined;
    return selectedExecutionNode?.snapshot ?? currentExecutionState.nodeSnapshotsByNodeId[selectedNodeId];
  }, [currentExecutionState, selectedExecutionNode, selectedNodeId]);
  const selectedWorkflowNode = useMemo(
    () => selectedExecutionNode?.node ?? displayedWorkflow?.nodes.find((node) => node.id === selectedNodeId),
    [displayedWorkflow, selectedExecutionNode, selectedNodeId],
  );
  const selectedPropertiesWorkflowNode = useMemo(
    () => (propertiesPanelNodeId ? displayedWorkflow?.nodes.find((node) => node.id === propertiesPanelNodeId) : undefined),
    [displayedWorkflow, propertiesPanelNodeId],
  );
  const inputPortEntries = useMemo(() => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.inputsByPort), [selectedNodeSnapshot]);
  const outputPortEntries = useMemo(() => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.outputs), [selectedNodeSnapshot]);
  const visibleOutputPortEntries = useMemo(
    () => WorkflowDetailPresenter.applyPinnedOutputToPortEntries(outputPortEntries, selectedPinnedOutput),
    [outputPortEntries, selectedPinnedOutput],
  );

  useEffect(() => {
    setSelectedInputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(inputPortEntries, current));
  }, [inputPortEntries]);

  useEffect(() => {
    setSelectedOutputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(visibleOutputPortEntries, current));
  }, [visibleOutputPortEntries]);

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
    (
      result: { runId: string; workflowId: string; status: string; startedAt?: string; state: PersistedRunState | null },
      options: Readonly<{ keepLiveWorkflow: boolean }>,
    ) => {
      if (result.state) {
        queryClient.setQueryData(
          WorkflowDetailPresenter.getWorkflowRunsQueryKey(result.workflowId),
          (existing: ReadonlyArray<RunSummary> | undefined) =>
            WorkflowDetailPresenter.mergeRunSummaryList(existing, WorkflowDetailPresenter.toRunSummary(result.state!)),
        );
        queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(result.runId), result.state);
      }
      if (options.keepLiveWorkflow) {
        setActiveLiveRunId(result.runId);
        setSelectedRunId(null);
        setIsRunsPaneVisible(false);
      } else {
        setSelectedRunId(result.runId);
        setIsRunsPaneVisible(true);
      }
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
    (request: RunWorkflowRequest = {}, options: Readonly<{ keepLiveWorkflow: boolean }> = { keepLiveWorkflow: false }) => {
      if (runRequestInFlightRef.current || (options.keepLiveWorkflow && isActiveLiveRunPending)) {
        return;
      }
      runRequestInFlightRef.current = true;
      setIsRunRequestPending(true);
      setError(null);
      const nextRequest: RunWorkflowRequest = options.keepLiveWorkflow
        ? {
            ...request,
            currentState: currentExecutionState
              ? (JSON.parse(JSON.stringify(currentExecutionState)) as NonNullable<RunWorkflowRequest["currentState"]>)
              : undefined,
          }
        : request;
      setPendingTriggerFetchSnapshot(
        options.keepLiveWorkflow
          ? (WorkflowDetailPresenter.createOptimisticTriggerFetchSnapshot(workflowId, workflow, nextRequest) ?? null)
          : null,
      );
      void WorkflowDetailPresenter.runWorkflow(workflowId, workflow, nextRequest)
        .then((result) => {
          setPendingTriggerFetchSnapshot(null);
          applyPendingRunResult(result, options);
        })
        .catch((cause: unknown) => {
          setPendingTriggerFetchSnapshot(null);
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => {
          runRequestInFlightRef.current = false;
          setIsRunRequestPending(false);
        });
    },
    [applyPendingRunResult, currentExecutionState, isActiveLiveRunPending, workflow, workflowId],
  );

  const onRun = useCallback(() => {
    runExecution({}, { keepLiveWorkflow: true });
  }, [runExecution]);

  const replaceDebuggerOverlay = useCallback(
    (nextCurrentState: NonNullable<typeof debuggerOverlay>["currentState"]) => {
      setError(null);
      return WorkflowDetailPresenter.replaceWorkflowDebuggerOverlay(workflowId, nextCurrentState).then((state) => {
        queryClient.setQueryData(WorkflowDetailPresenter.getWorkflowDebuggerOverlayQueryKey(workflowId), state);
        return state;
      });
    },
    [queryClient, workflowId],
  );

  const createOverlayCurrentStateWithNodeState = useCallback(
    (
      nodeId: string,
      values: Readonly<{
        pinnedOutputsByPort?: NonNullable<NonNullable<PersistedRunState["mutableState"]>["nodesById"][string]["pinnedOutputsByPort"]>;
      }>,
    ) => {
      const baseCurrentState = JSON.parse(
        JSON.stringify(currentExecutionState ?? { outputsByNode: {}, nodeSnapshotsByNodeId: {}, mutableState: { nodesById: {} } }),
      ) as NonNullable<typeof debuggerOverlay>["currentState"];
      return {
        ...baseCurrentState,
        mutableState: {
          nodesById: {
            ...(baseCurrentState.mutableState?.nodesById ?? {}),
            [nodeId]: {
              ...(baseCurrentState.mutableState?.nodesById?.[nodeId] ?? {}),
              ...values,
            },
          },
        },
      } satisfies NonNullable<typeof debuggerOverlay>["currentState"];
    },
    [currentExecutionState, debuggerOverlay],
  );

  const runNode = useCallback(
    (nodeId: string) => {
      if (viewContext !== "live-workflow") {
        return;
      }
      setHasManuallySelectedNode(true);
      setSelectedNodeId(nodeId);
      runExecution({
        stopAt: nodeId,
        clearFromNodeId: nodeId,
        mode: "manual",
      }, { keepLiveWorkflow: true });
    },
    [runExecution, viewContext],
  );

  const onPinSelectedOutput = useCallback(() => {
    if (!selectedNodeId || viewContext !== "live-workflow") {
      return;
    }
    setJsonEditorState({
      mode: "pin-output",
      title: `Pin output for ${WorkflowDetailPresenter.getNodeDisplayName(selectedWorkflowNode, selectedNodeId)}`,
      value: WorkflowDetailPresenter.toEditableJson(selectedPinnedOutput ?? selectedNodeSnapshot?.outputs?.main),
    });
  }, [selectedNodeId, selectedNodeSnapshot, selectedPinnedOutput, selectedWorkflowNode, viewContext]);

  const openPinOutputEditor = useCallback(
    (nodeId: string) => {
      if (viewContext !== "live-workflow") {
        return;
      }
      const workflowNode = displayedWorkflow?.nodes.find((node) => node.id === nodeId);
      const snapshot = currentExecutionState?.nodeSnapshotsByNodeId?.[nodeId];
      const pinnedOutput = WorkflowDetailPresenter.getPinnedOutput(currentExecutionState, nodeId);
      setHasManuallySelectedNode(true);
      setSelectedNodeId(nodeId);
      setJsonEditorState({
        mode: "pin-output",
        title: `Edit output for ${WorkflowDetailPresenter.getNodeDisplayName(workflowNode, nodeId)}`,
        value: WorkflowDetailPresenter.toEditableJson(pinnedOutput ?? snapshot?.outputs?.main),
      });
    },
    [currentExecutionState, displayedWorkflow, viewContext],
  );

  const onClearPin = useCallback(() => {
    if (!selectedNodeId || viewContext !== "live-workflow") {
      return;
    }
    const nextCurrentState = createOverlayCurrentStateWithNodeState(selectedNodeId, {
      pinnedOutputsByPort: undefined,
    });
    void replaceDebuggerOverlay(nextCurrentState)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [createOverlayCurrentStateWithNodeState, replaceDebuggerOverlay, selectedNodeId, viewContext]);

  const clearPinnedOutputForNode = useCallback(
    (nodeId: string) => {
      if (viewContext !== "live-workflow") {
        return;
      }
      const nextCurrentState = createOverlayCurrentStateWithNodeState(nodeId, {
        pinnedOutputsByPort: undefined,
      });
      setHasManuallySelectedNode(true);
      setSelectedNodeId(nodeId);
      void replaceDebuggerOverlay(nextCurrentState).catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
    },
    [createOverlayCurrentStateWithNodeState, replaceDebuggerOverlay, viewContext],
  );

  const togglePinnedOutputForNode = useCallback(
    (nodeId: string) => {
      if (viewContext !== "live-workflow") {
        return;
      }
      const pinnedOutput = WorkflowDetailPresenter.getPinnedOutput(currentExecutionState, nodeId);
      setHasManuallySelectedNode(true);
      setSelectedNodeId(nodeId);
      if (pinnedOutput) {
        const nextCurrentState = createOverlayCurrentStateWithNodeState(nodeId, {
          pinnedOutputsByPort: undefined,
        });
        void replaceDebuggerOverlay(nextCurrentState).catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : String(cause)),
        );
        return;
      }
      const outputToPin = currentExecutionState?.nodeSnapshotsByNodeId?.[nodeId]?.outputs?.main;
      if (!outputToPin) {
        return;
      }
      const nextCurrentState = createOverlayCurrentStateWithNodeState(nodeId, {
        pinnedOutputsByPort: {
          main: JSON.parse(JSON.stringify(outputToPin)) as Items,
        },
      });
      void replaceDebuggerOverlay(nextCurrentState).catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
    },
    [createOverlayCurrentStateWithNodeState, currentExecutionState, replaceDebuggerOverlay, viewContext],
  );

  const onCopyToDebugger = useCallback(() => {
    if (!selectedRun) {
      return;
    }
    setError(null);
    void WorkflowDetailPresenter.copyRunToDebuggerOverlay(workflowId, selectedRun.runId)
      .then((state) => {
        queryClient.setQueryData(WorkflowDetailPresenter.getWorkflowDebuggerOverlayQueryKey(workflowId), state);
        setActiveLiveRunId(null);
        setSelectedRunId(null);
        setIsRunsPaneVisible(false);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [queryClient, selectedRun, workflowId]);

  const onSelectRun = useCallback((runId: string) => {
    setIsRunsPaneVisible(true);
    setSelectedRunId(runId);
  }, []);

  const onSelectLiveWorkflow = useCallback(() => {
    setSelectedRunId(null);
    setIsRunsPaneVisible(false);
  }, []);

  const onOpenExecutionsPane = useCallback(() => {
    setIsRunsPaneVisible(true);
  }, []);

  const persistWorkflowSnapshotUpdate = useCallback(
    (runId: string, value: string) => {
      void WorkflowDetailPresenter.updateWorkflowSnapshot(runId, WorkflowDetailPresenter.parseWorkflowSnapshot(value))
        .then((state) => {
          queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(state.runId), state);
          setJsonEditorState(null);
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    },
    [queryClient],
  );

  const saveJsonEditor = useCallback(
    (value: string) => {
      if (!jsonEditorState) {
        return;
      }
      if (jsonEditorState.mode === "workflow-snapshot") {
        if (!selectedRunId) return;
        persistWorkflowSnapshotUpdate(selectedRunId, value);
        return;
      }
      if (!selectedRunId || !selectedNodeId) {
        if (!selectedNodeId || viewContext !== "live-workflow") {
          return;
        }
      }
      if (jsonEditorState.mode === "pin-output") {
        const pinnedItems = WorkflowDetailPresenter.parseEditableItems(value);
        const nextCurrentState = createOverlayCurrentStateWithNodeState(selectedNodeId, {
          pinnedOutputsByPort: { main: pinnedItems },
        });
        void replaceDebuggerOverlay(nextCurrentState)
          .then(() => {
            setJsonEditorState(null);
          })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
        return;
      }
      if (!selectedRunId) {
        return;
      }
      persistWorkflowSnapshotUpdate(selectedRunId, value);
    },
    [
      applyPendingRunResult,
      createOverlayCurrentStateWithNodeState,
      jsonEditorState,
      persistWorkflowSnapshotUpdate,
      queryClient,
      replaceDebuggerOverlay,
      selectedNodeId,
      selectedRunId,
      viewContext,
      workflow,
      workflowId,
    ],
  );

  const workflowError = workflowQuery.error instanceof Error ? workflowQuery.error.message : null;
  const runsError = runsQuery.error instanceof Error ? runsQuery.error.message : null;
  const inspectorLoadError =
    viewContext === "historical-run"
      ? selectedRunQuery.error instanceof Error
        ? selectedRunQuery.error.message
        : null
      : debuggerOverlayQuery.error instanceof Error
        ? debuggerOverlayQuery.error.message
        : null;
  const selectedInputItems = useMemo(() => inputPortEntries.find(([portName]) => portName === selectedInputPort)?.[1], [inputPortEntries, selectedInputPort]);
  const selectedOutputItems = useMemo(
    () => visibleOutputPortEntries.find(([portName]) => portName === selectedOutputPort)?.[1],
    [selectedOutputPort, visibleOutputPortEntries],
  );
  const selectedNodeError = selectedNodeSnapshot?.error;
  const inputAttachments = useMemo(() => WorkflowDetailPresenter.toAttachmentModels(selectedInputItems), [selectedInputItems]);
  const outputAttachments = useMemo(
    () => WorkflowDetailPresenter.toAttachmentModels(selectedNodeError ? undefined : selectedOutputItems),
    [selectedNodeError, selectedOutputItems],
  );

  useEffect(() => {
    setInspectorFormatByTab((current) => {
      const nextInputFormat = current.input === "binary" && inputAttachments.length === 0 ? "json" : current.input;
      const nextOutputFormat = current.output === "binary" && outputAttachments.length === 0 ? "json" : current.output;
      if (nextInputFormat === current.input && nextOutputFormat === current.output) {
        return current;
      }
      return {
        input: nextInputFormat,
        output: nextOutputFormat,
      };
    });
  }, [inputAttachments.length, outputAttachments.length]);

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

  const selectNode = useCallback((nodeId: string) => {
    setHasManuallySelectedNode(true);
    setSelectedNodeId(nodeId);
  }, []);

  const openPropertiesPanelForNode = useCallback((nodeId: string) => {
    setPropertiesPanelNodeId(nodeId);
    setIsPropertiesPanelOpen(true);
  }, []);

  const closePropertiesPanel = useCallback(() => {
    setIsPropertiesPanelOpen(false);
    setPropertiesPanelNodeId(null);
  }, []);

  return {
    displayedWorkflow,
    displayedNodeSnapshotsByNodeId: currentExecutionState?.nodeSnapshotsByNodeId ?? {},
    pinnedNodeIds,
    isLiveWorkflowView: viewContext === "live-workflow",
    isRunsPaneVisible,
    isRunning,
    workflowDevBuildState,
    isRealtimeConnected,
    canCopySelectedRunToLive: viewContext === "historical-run" && Boolean(selectedRun),
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
    },
    sidebarFormatting: {
      formatDateTime: WorkflowDetailPresenter.formatDateTime,
      formatRunListWhen: WorkflowDetailPresenter.formatRunListWhen,
      formatRunListDurationLine: WorkflowDetailPresenter.formatRunListDurationLine,
      getExecutionModeLabel: WorkflowDetailPresenter.getExecutionModeLabel,
    },
    sidebarActions: {
      onSelectRun,
    },
    inspectorModel: {
      workflowId,
      viewContext,
      selectedRunId,
      isLoading: viewContext === "historical-run" ? selectedRunQuery.isLoading : debuggerOverlayQuery.isLoading,
      loadError: inspectorLoadError,
      selectedRun,
      selectedNodeId,
      selectedNodeSnapshot,
      selectedWorkflowNode,
      selectedPinnedOutput,
      selectedNodeError,
      selectedMode,
      inputPane,
      outputPane,
      executionTreeData,
      executionTreeExpandedKeys,
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
      onEditSelectedOutput: onPinSelectedOutput,
      onClearPinnedOutput: onClearPin,
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
    propertiesPanelNodeId,
    isPropertiesPanelOpen,
    selectedPropertiesWorkflowNode,
    selectCanvasNode: selectNode,
    openPropertiesPanelForNode,
    closePropertiesPanel,
    runCanvasNode: runNode,
    toggleCanvasNodePin: togglePinnedOutputForNode,
    editCanvasNodeOutput: openPinOutputEditor,
    clearCanvasNodePin: clearPinnedOutputForNode,
    runWorkflowFromCanvas: onRun,
    openLiveWorkflow: onSelectLiveWorkflow,
    openExecutionsPane: onOpenExecutionsPane,
    copySelectedRunToLive: onCopyToDebugger,
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

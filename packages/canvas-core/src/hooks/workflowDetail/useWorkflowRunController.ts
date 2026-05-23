"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkflowCanvasApiClient } from "../../context/WorkflowCanvasApiClientContext";
import { CodemationApiHttpError } from "../../lib/CodemationApiHttpError";
import { WorkflowActivationHttpErrorFormat } from "../../lib/workflowDetail/WorkflowActivationHttpErrorFormat";
import type { WorkflowRunInternalError } from "../../types/WorkflowCanvasConfig";
import { WorkflowDetailPresenter, type RunWorkflowRequest } from "../../lib/workflowDetail/WorkflowDetailPresenter";
import { resolveFetchedRunState } from "../realtime/runQueryPolling";
import {
  useRunQuery,
  useSetWorkflowActivationMutation,
  useWorkflowCredentialHealthQuery,
  useWorkflowDebuggerOverlayQuery,
  useWorkflowDevBuildStateQuery,
  useWorkflowQuery,
  useWorkflowRealtimeSubscription,
  useWorkflowRunsQuery,
  type NodeExecutionSnapshot,
  type PersistedRunState,
  type RunCurrentState,
  type RunSummary,
  type WorkflowDevBuildState,
  type WorkflowDto,
} from "../realtime/realtime";
import { useWorkflowRealtimeShowDisconnectedBadge } from "../realtime/useWorkflowRealtimeShowDisconnectedBadge";
import type { NavigationAdapter } from "../../types/NavigationAdapter";
import type { WorkflowCanvasConfig } from "../../types/WorkflowCanvasConfig";
import type { WorkflowRunControllerReturn } from "../../types/workflowDetail/WorkflowRunControllerReturn.types";

/**
 * Detects whether the run-workflow request failed with a 500 unhandled server error. The host's
 * ServerHttpErrorResponseFactory now puts `{ error, message, stack?, cause?, name? }` in the
 * response body — parse it back so the canvas can present a copy/pastable dialog or hand it to
 * an external handler (e.g. the control-plane agent chat).
 *
 * Exported for unit tests.
 */
export function extractRunInternalError(cause: unknown): WorkflowRunInternalError | null {
  if (!(cause instanceof CodemationApiHttpError)) {
    return null;
  }
  if (cause.status < 500) {
    return null;
  }
  try {
    const parsed = JSON.parse(cause.bodyText) as Record<string, unknown>;
    const message = typeof parsed.message === "string" && parsed.message.length > 0 ? parsed.message : cause.message;
    return {
      message,
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      stack: typeof parsed.stack === "string" ? parsed.stack : undefined,
      cause: typeof parsed.cause === "string" ? parsed.cause : undefined,
    };
  } catch {
    return { message: cause.bodyText.trim().length > 0 ? cause.bodyText : cause.message };
  }
}

// Stable fallback so `?? EMPTY_NODE_SNAPSHOTS` never produces a fresh `{}` on renders
// where currentExecutionState is undefined, keeping ELK layout deps stable.
const EMPTY_NODE_SNAPSHOTS: Readonly<Record<string, NodeExecutionSnapshot>> = Object.freeze({});
// Stable no-op for read-only mode — inline `() => {}` literals cause spurious re-renders.
const NO_OP_VOID_ACTION = (): void => {};

export function useWorkflowRunController(
  args: Readonly<{
    workflowId: string;
    initialWorkflow?: WorkflowDto;
    navigation: NavigationAdapter;
    config?: WorkflowCanvasConfig;
  }>,
): WorkflowRunControllerReturn {
  const { workflowId, initialWorkflow, navigation, config } = args;
  const isReadOnly = config?.readOnly === true;
  const apiClient = useWorkflowCanvasApiClient();
  const { urlLocation, navigateToLocation } = navigation;
  const queryClient = useQueryClient();

  const workflowQuery = useWorkflowQuery(workflowId, initialWorkflow);
  const setWorkflowActivationMutation = useSetWorkflowActivationMutation(workflowId);
  const workflowCredentialHealthQuery = useWorkflowCredentialHealthQuery(workflowId);
  const runsQuery = useWorkflowRunsQuery(workflowId);
  const debuggerOverlayQuery = useWorkflowDebuggerOverlayQuery(workflowId);
  const workflowDevBuildStateQuery = useWorkflowDevBuildStateQuery(workflowId);
  const showRealtimeDisconnectedBadge = useWorkflowRealtimeShowDisconnectedBadge();
  useWorkflowRealtimeSubscription(workflowId);

  const workflowActivationErrorFormat = useMemo(() => new WorkflowActivationHttpErrorFormat(), []);
  const [workflowActivationAlertLines, setWorkflowActivationAlertLines] = useState<ReadonlyArray<string> | null>(null);
  const [runErrorAlertLines, setRunErrorAlertLines] = useState<ReadonlyArray<string> | null>(null);
  const [runInternalError, setRunInternalError] = useState<WorkflowRunInternalError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunRequestPending, setIsRunRequestPending] = useState(false);
  const [pendingTriggerFetchSnapshot, setPendingTriggerFetchSnapshot] = useState<NodeExecutionSnapshot | null>(null);
  const [activeLiveRunId, setActiveLiveRunId] = useState<string | null>(null);
  const [pendingSelectedRun, setPendingSelectedRun] = useState<RunSummary | null>(null);

  const selectedRunId = urlLocation.selectedRunId;
  const isRunsPaneVisible = urlLocation.isRunsPaneVisible;

  const workflowDevBuildStateQueryKey = useMemo(() => ["workflow-dev-build-state", workflowId] as const, [workflowId]);

  const workflow = workflowQuery.data;
  const workflowDevBuildState = workflowDevBuildStateQuery.data ?? {
    state: "idle",
    updatedAt: new Date(0).toISOString(),
  };
  const liveWorkflowSignature = useMemo(
    () => WorkflowDetailPresenter.createWorkflowStructureSignature(workflow),
    [workflow],
  );
  const runs = runsQuery.data;
  const selectedRunQuery = useRunQuery(selectedRunId);
  const selectedRun = selectedRunQuery.data;
  const activeLiveRunQuery = useRunQuery(activeLiveRunId, { pollWhileNonTerminalMs: 5000 });
  const activeLiveRun = activeLiveRunQuery.data;
  const debuggerOverlay = debuggerOverlayQuery.data;

  const viewContext = selectedRunId ? "historical-run" : "live-workflow";

  const liveExecutionState = useMemo(() => {
    const overlayCurrentState = debuggerOverlay?.currentState;
    const baseLiveExecutionState = !activeLiveRunId
      ? overlayCurrentState
      : !activeLiveRun
        ? ({
            outputsByNode: {},
            nodeSnapshotsByNodeId: {},
            mutableState: overlayCurrentState?.mutableState,
            connectionInvocations: overlayCurrentState?.connectionInvocations,
          } satisfies RunCurrentState)
        : ({
            outputsByNode: activeLiveRun.outputsByNode,
            nodeSnapshotsByNodeId: activeLiveRun.nodeSnapshotsByNodeId,
            mutableState: overlayCurrentState?.mutableState ?? activeLiveRun.mutableState,
            connectionInvocations: activeLiveRun.connectionInvocations ?? overlayCurrentState?.connectionInvocations,
          } satisfies RunCurrentState);
    const reconciledBaseLiveExecutionState = WorkflowDetailPresenter.reconcileCurrentStateWithWorkflow(
      baseLiveExecutionState,
      workflow,
    );
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
        connectionInvocations: overlayCurrentState?.connectionInvocations,
      }),
      nodeSnapshotsByNodeId: {
        ...(reconciledBaseLiveExecutionState?.nodeSnapshotsByNodeId ?? {}),
        [pendingTriggerFetchSnapshot.nodeId]: pendingTriggerFetchSnapshot,
      },
    } satisfies RunCurrentState;
  }, [activeLiveRun, activeLiveRunId, debuggerOverlay, pendingTriggerFetchSnapshot, workflow]);

  const displayedWorkflow = useMemo(
    () =>
      WorkflowDetailPresenter.resolveViewedWorkflowForContext({
        viewContext,
        selectedRun,
        activeLiveRun,
        liveWorkflow: workflow,
      }),
    [activeLiveRun, selectedRun, viewContext, workflow],
  );

  const currentExecutionState = useMemo(
    () => (viewContext === "live-workflow" ? liveExecutionState : selectedRun),
    [liveExecutionState, selectedRun, viewContext],
  );

  const propertiesPanelTelemetryRunId = useMemo(() => {
    if (selectedRunId) return selectedRunId;
    if (activeLiveRun?.runId) return activeLiveRun.runId;
    if (activeLiveRunId) return activeLiveRunId;
    const snapshotRunId = Object.values(currentExecutionState?.nodeSnapshotsByNodeId ?? {})[0]?.runId;
    if (snapshotRunId) return snapshotRunId;
    return currentExecutionState?.connectionInvocations?.[0]?.runId ?? null;
  }, [activeLiveRun?.runId, activeLiveRunId, currentExecutionState, selectedRunId]);

  const propertiesPanelTelemetryRunStatus = useMemo<PersistedRunState["status"] | undefined>(() => {
    if (selectedRunId) return selectedRun?.status;
    if (activeLiveRunId) return activeLiveRun?.status;
    return undefined;
  }, [activeLiveRun?.status, activeLiveRunId, selectedRun?.status, selectedRunId]);

  const normalizedConnectionInvocations = useMemo(
    () => WorkflowDetailPresenter.normalizeConnectionInvocations(currentExecutionState?.connectionInvocations),
    [currentExecutionState?.connectionInvocations],
  );

  const isActiveLiveRunPending = useMemo(
    () =>
      Boolean(
        activeLiveRunId &&
        (!activeLiveRun ||
          (activeLiveRun.status !== "completed" &&
            activeLiveRun.status !== "failed" &&
            (activeLiveRun.status === "pending" ||
              activeLiveRun.pending ||
              Object.values(activeLiveRun.nodeSnapshotsByNodeId).some(
                (snapshot) => snapshot.status === "queued" || snapshot.status === "running",
              )))),
      ),
    [activeLiveRun, activeLiveRunId],
  );
  const isRunning = isRunRequestPending || (viewContext === "live-workflow" && isActiveLiveRunPending);

  const pinnedNodeIds = useMemo(
    () =>
      new Set(
        Object.keys(currentExecutionState?.mutableState?.nodesById ?? {}).filter(
          (nodeId) =>
            Object.keys(currentExecutionState?.mutableState?.nodesById?.[nodeId]?.pinnedOutputsByPort ?? {}).length > 0,
        ),
      ),
    [currentExecutionState],
  );

  const displayedRuns = useMemo(() => {
    if (!pendingSelectedRun) return runs;
    if (!runs) return [pendingSelectedRun];
    if (runs.some((run) => run.runId === pendingSelectedRun.runId)) return runs;
    return [pendingSelectedRun, ...runs];
  }, [pendingSelectedRun, runs]);

  const credentialAttention = useMemo(
    () =>
      WorkflowDetailPresenter.resolveCredentialAttention({
        workflow,
        slots: workflowCredentialHealthQuery.data?.slots,
      }),
    [workflow, workflowCredentialHealthQuery.data?.slots],
  );

  const credentialAttentionTooltipByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of workflowCredentialHealthQuery.data?.slots ?? []) {
      if (slot.health.status !== "unbound") continue;
      const nodeLabel = slot.nodeName ?? workflow?.nodes.find((n) => n.id === slot.nodeId)?.name ?? slot.nodeId;
      const line = `${slot.requirement.label} (${slot.requirement.acceptedTypes.join(" · ")})`;
      const existing = map.get(slot.nodeId);
      map.set(slot.nodeId, existing ? `${existing}\n${line}` : `${nodeLabel}\n${line}`);
    }
    return map;
  }, [workflow, workflowCredentialHealthQuery.data?.slots]);

  const workflowNodeIdsWithBoundCredential = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of workflowCredentialHealthQuery.data?.slots ?? []) {
      if (slot.instance?.instanceId) ids.add(slot.nodeId);
    }
    return ids;
  }, [workflowCredentialHealthQuery.data?.slots]);

  const previousLiveWorkflowSignatureRef = useRef<string | null>(null);
  const runRequestInFlightRef = useRef(false);

  // Reset all run state when workflowId changes.
  useEffect(() => {
    setActiveLiveRunId(null);
    setPendingSelectedRun(null);
    setPendingTriggerFetchSnapshot(null);
    setRunErrorAlertLines(null);
    setError(null);
    setIsRunRequestPending(false);
    previousLiveWorkflowSignatureRef.current = null;
    runRequestInFlightRef.current = false;
  }, [workflowId]);

  useEffect(() => {
    if (pendingSelectedRun && runs?.some((run) => run.runId === pendingSelectedRun.runId)) {
      setPendingSelectedRun(null);
    }
  }, [pendingSelectedRun, runs]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (displayedRuns === undefined) return;
    if (displayedRuns.some((run) => run.runId === selectedRunId)) return;
    navigateToLocation({
      selectedRunId: null,
      isRunsPaneVisible: true,
      nodeId: urlLocation.nodeId,
    });
  }, [displayedRuns, navigateToLocation, selectedRunId, urlLocation.nodeId]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (selectedRunQuery.isLoading) return;
    if (!selectedRunQuery.isError) return;
    navigateToLocation({
      selectedRunId: null,
      isRunsPaneVisible: true,
      nodeId: urlLocation.nodeId,
    });
  }, [navigateToLocation, selectedRunId, selectedRunQuery.isError, selectedRunQuery.isLoading, urlLocation.nodeId]);

  useEffect(() => {
    if (!workflow) return;
    const previousSignature = previousLiveWorkflowSignatureRef.current;
    previousLiveWorkflowSignatureRef.current = liveWorkflowSignature;
    if (previousSignature === null || previousSignature === liveWorkflowSignature || selectedRunId) return;
    queryClient.setQueryData(
      WorkflowDetailPresenter.getWorkflowDebuggerOverlayQueryKey(workflowId),
      (existing: typeof debuggerOverlay | undefined) => {
        if (!existing) return existing;
        return {
          ...existing,
          currentState:
            WorkflowDetailPresenter.reconcileCurrentStateWithWorkflow(existing.currentState, workflow) ??
            existing.currentState,
        };
      },
    );
    setActiveLiveRunId(null);
    setPendingSelectedRun(null);
    setPendingTriggerFetchSnapshot(null);
  }, [debuggerOverlay, liveWorkflowSignature, queryClient, selectedRunId, workflow, workflowId]);

  useEffect(() => {
    if (workflowDevBuildState.state !== "building" || !workflowDevBuildState.awaitingWorkflowRefreshAt) return;
    if (workflowQuery.isFetching) return;
    if (workflowQuery.isError) {
      queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey, (existing) => {
        if (!existing || existing.state !== "building") return existing;
        return { state: "idle", updatedAt: new Date().toISOString(), buildVersion: existing.buildVersion };
      });
      return;
    }
    const workflowRefreshRequestedAt = Date.parse(workflowDevBuildState.awaitingWorkflowRefreshAt);
    if (!Number.isFinite(workflowRefreshRequestedAt) || workflowQuery.dataUpdatedAt < workflowRefreshRequestedAt)
      return;
    queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey, (existing) => {
      if (!existing || existing.state !== "building") return existing;
      return { state: "idle", updatedAt: new Date().toISOString(), buildVersion: existing.buildVersion };
    });
  }, [
    queryClient,
    workflowDevBuildState.awaitingWorkflowRefreshAt,
    workflowDevBuildStateQueryKey,
    workflowDevBuildState.state,
    workflowQuery.dataUpdatedAt,
    workflowQuery.isError,
    workflowQuery.isFetching,
  ]);

  const applyPendingRunResult = useCallback(
    (
      result: {
        runId: string;
        workflowId: string;
        status: string;
        startedAt?: string;
        state: PersistedRunState | null;
      },
      options: Readonly<{ keepLiveWorkflow: boolean }>,
    ) => {
      if (result.state) {
        queryClient.setQueryData(
          WorkflowDetailPresenter.getWorkflowRunsQueryKey(result.workflowId),
          (existing: ReadonlyArray<RunSummary> | undefined) =>
            WorkflowDetailPresenter.mergeRunSummaryList(existing, WorkflowDetailPresenter.toRunSummary(result.state!)),
        );
        queryClient.setQueryData(
          WorkflowDetailPresenter.getRunQueryKey(result.runId),
          (existing: PersistedRunState | undefined) =>
            resolveFetchedRunState({ incoming: result.state!, previous: existing }),
        );
      }
      if (options.keepLiveWorkflow) {
        setActiveLiveRunId(result.runId);
        navigateToLocation({ selectedRunId: null, isRunsPaneVisible: false, nodeId: null });
      } else {
        navigateToLocation({ selectedRunId: result.runId, isRunsPaneVisible: true, nodeId: null });
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
    [navigateToLocation, queryClient],
  );

  const runExecution = useCallback(
    (
      request: RunWorkflowRequest = {},
      options: Readonly<{ keepLiveWorkflow: boolean }> = { keepLiveWorkflow: false },
    ) => {
      if (runRequestInFlightRef.current || (options.keepLiveWorkflow && isActiveLiveRunPending)) return;
      runRequestInFlightRef.current = true;
      setIsRunRequestPending(true);
      setError(null);
      setRunErrorAlertLines(null);
      setRunInternalError(null);
      const nextRequest: RunWorkflowRequest = options.keepLiveWorkflow
        ? {
            ...request,
            currentState: WorkflowDetailPresenter.createLiveRunCurrentState(request, currentExecutionState),
          }
        : request;
      setPendingTriggerFetchSnapshot(
        options.keepLiveWorkflow
          ? (WorkflowDetailPresenter.createOptimisticTriggerFetchSnapshot(workflowId, workflow, nextRequest) ?? null)
          : null,
      );
      void WorkflowDetailPresenter.runWorkflow(apiClient, workflowId, workflow, nextRequest)
        .then((result) => {
          setPendingTriggerFetchSnapshot(null);
          applyPendingRunResult(result, options);
        })
        .catch((cause: unknown) => {
          setPendingTriggerFetchSnapshot(null);
          const internal = extractRunInternalError(cause);
          if (internal) {
            const consumed = config?.onWorkflowRunInternalError?.(internal) === true;
            if (!consumed) {
              setRunInternalError(internal);
            }
            return;
          }
          setRunErrorAlertLines(workflowActivationErrorFormat.extractMessages(cause));
        })
        .finally(() => {
          runRequestInFlightRef.current = false;
          setIsRunRequestPending(false);
        });
    },
    [applyPendingRunResult, currentExecutionState, isActiveLiveRunPending, workflow, workflowId],
  );

  const replaceDebuggerOverlay = useCallback(
    (nextCurrentState: RunCurrentState): Promise<void> => {
      setError(null);
      return WorkflowDetailPresenter.replaceWorkflowDebuggerOverlay(apiClient, workflowId, nextCurrentState)
        .then((state) => {
          queryClient.setQueryData(WorkflowDetailPresenter.getWorkflowDebuggerOverlayQueryKey(workflowId), state);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
          // Re-throw so callers (pin editor save) know the commit failed
          // and can keep the editor open (matching original behavior).
          throw cause;
        });
    },
    [apiClient, queryClient, workflowId],
  );

  const startRun = useCallback(
    (request: RunWorkflowRequest = {}) => {
      runExecution({ mode: "manual", ...request }, { keepLiveWorkflow: true });
    },
    [runExecution],
  );

  const startRunForNode = useCallback(
    (nodeId: string) => {
      if (viewContext !== "live-workflow") return;
      runExecution({ stopAt: nodeId, clearFromNodeId: nodeId, mode: "manual" }, { keepLiveWorkflow: true });
    },
    [runExecution, viewContext],
  );

  const onCopyToDebugger = useCallback(() => {
    if (!selectedRun) return;
    setError(null);
    void WorkflowDetailPresenter.copyRunToDebuggerOverlay(apiClient, workflowId, selectedRun.runId)
      .then((state) => {
        queryClient.setQueryData(WorkflowDetailPresenter.getWorkflowDebuggerOverlayQueryKey(workflowId), state);
        setActiveLiveRunId(null);
        navigateToLocation({ selectedRunId: null, isRunsPaneVisible: false, nodeId: null });
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [apiClient, navigateToLocation, queryClient, selectedRun, workflowId]);

  const onSelectRun = useCallback(
    (runId: string) => {
      navigateToLocation({ selectedRunId: runId, isRunsPaneVisible: true, nodeId: null });
    },
    [navigateToLocation],
  );

  const onSelectLiveWorkflow = useCallback(() => {
    navigateToLocation({ selectedRunId: null, isRunsPaneVisible: false, nodeId: null });
  }, [navigateToLocation]);

  const persistWorkflowSnapshotUpdate = useCallback(
    (runId: string, value: string): Promise<void> => {
      return WorkflowDetailPresenter.updateWorkflowSnapshot(
        apiClient,
        runId,
        WorkflowDetailPresenter.parseWorkflowSnapshot(value),
      )
        .then((state) => {
          queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(state.runId), state);
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    },
    [apiClient, queryClient],
  );

  const onOpenExecutionsPane = useCallback(() => {
    navigateToLocation({
      selectedRunId: urlLocation.selectedRunId,
      isRunsPaneVisible: true,
      nodeId: urlLocation.nodeId,
    });
  }, [navigateToLocation, urlLocation.nodeId, urlLocation.selectedRunId]);

  const workflowError = workflowQuery.error instanceof Error ? workflowQuery.error.message : null;
  const runsError = runsQuery.error instanceof Error ? runsQuery.error.message : null;

  return {
    // Shared state for peer controllers
    viewContext,
    currentExecutionState,
    workflow,
    startRun,
    startRunForNode,
    replaceDebuggerOverlay,
    persistWorkflowSnapshotUpdate,
    // Public fields
    displayedWorkflow,
    displayedNodeSnapshotsByNodeId: currentExecutionState?.nodeSnapshotsByNodeId ?? EMPTY_NODE_SNAPSHOTS,
    displayedConnectionInvocations: normalizedConnectionInvocations,
    pinnedNodeIds,
    isLiveWorkflowView: viewContext === "live-workflow",
    isRunsPaneVisible,
    isRunning,
    workflowDevBuildState,
    showRealtimeDisconnectedBadge,
    canCopySelectedRunToLive: viewContext === "historical-run" && Boolean(selectedRun),
    credentialAttentionNodeIds: credentialAttention.attentionNodeIds,
    credentialAttentionSummaryLines: credentialAttention.summaryLines,
    credentialAttentionTooltipByNodeId,
    workflowNodeIdsWithBoundCredential,
    selectedRun,
    propertiesPanelTelemetryRunId,
    propertiesPanelTelemetryRunStatus,
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
    sidebarActions: { onSelectRun },
    runWorkflowFromCanvas: isReadOnly ? NO_OP_VOID_ACTION : startRun,
    openLiveWorkflow: onSelectLiveWorkflow,
    openExecutionsPane: onOpenExecutionsPane,
    copySelectedRunToLive: onCopyToDebugger,
    workflowIsActive: workflow?.active ?? false,
    isWorkflowActivationPending: setWorkflowActivationMutation.isPending,
    workflowActivationAlertLines,
    dismissWorkflowActivationAlert: () => {
      setWorkflowActivationAlertLines(null);
    },
    setWorkflowActive: isReadOnly
      ? () => {}
      : (active: boolean) => {
          setWorkflowActivationAlertLines(null);
          setWorkflowActivationMutation.mutate(active, {
            onSuccess: () => {
              setWorkflowActivationAlertLines(null);
            },
            onError: (mutationError) => {
              setWorkflowActivationAlertLines(workflowActivationErrorFormat.extractMessages(mutationError));
            },
          });
        },
    runErrorAlertLines,
    dismissRunErrorAlert: () => {
      setRunErrorAlertLines(null);
    },
    runInternalError,
    dismissRunInternalError: () => {
      setRunInternalError(null);
    },
  };
}

"use client";

export type {
  AppGalleryEntry,
  AppsResponse,
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  WorkflowCredentialHealthDto,
} from "@codemation/host/dto";
export type { WorkflowDto, WorkflowSummary } from "@codemation/host/dto";
export type { InviteUserResponseDto, UserAccountDto, UserAccountStatus } from "@codemation/host/dto";

export * from "../../realtime/realtimeDomainTypes";

export {
  useInviteUserMutation,
  useRegenerateUserInviteMutation,
  useUpdateUserAccountStatusMutation,
} from "./userAccountMutations";

import type { WorkflowDto, WorkflowSummary } from "@codemation/host/dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext, useEffect, useRef, useState } from "react";
import { RealtimeContext } from "../../realtime/RealtimeContext";
import { RealtimeReadyState } from "../../realtime/realtimeClientBridge";
import { getRealtimeBridge } from "../../realtime/realtimeClientBridge";
import {
  credentialAppsQueryKey,
  credentialFieldEnvStatusQueryKey,
  credentialInstanceWithSecretsQueryKey,
  credentialInstancesQueryKey,
  credentialTypesQueryKey,
  runDetailQueryKey,
  runQueryKey,
  userAccountsQueryKey,
  workflowCredentialHealthQueryKey,
  workflowDebuggerOverlayQueryKey,
  workflowDevBuildStateQueryKey,
  workflowQueryKey,
  workflowRunsQueryKey,
  workflowsQueryKey,
} from "../../realtime/realtimeQueryKeys";
import type {
  PersistedRunState,
  WorkflowDevBuildState,
  WorkflowRunDetailDto,
} from "../../realtime/realtimeDomainTypes";
import { WorkflowQueryRetryPolicy } from "../../realtime/WorkflowQueryRetryPolicy";
import { resolveFetchedRunState, resolveRunPollingIntervalMs } from "./runQueryPolling";
import {
  useWorkflowCanvasApiClient,
  useWorkflowCanvasApiClientOptional,
} from "../../context/WorkflowCanvasApiClientContext";
export { useTelemetryRunTraceQuery } from "./useTelemetryRunTraceQuery";

export function useWorkflowRealtimeSubscription(workflowId: string | null | undefined): void {
  const [bridgeVersion, setBridgeVersion] = useState(0);
  const retainWorkflowSubscription =
    useContext(RealtimeContext)?.retainWorkflowSubscription ?? getRealtimeBridge().retainWorkflowSubscription;

  useEffect(() => {
    const bridge = getRealtimeBridge();
    const handleBridgeUpdate = () => {
      setBridgeVersion((current) => current + 1);
    };
    bridge.listeners.add(handleBridgeUpdate);
    return () => {
      bridge.listeners.delete(handleBridgeUpdate);
    };
  }, []);

  useEffect(() => {
    if (!retainWorkflowSubscription || !workflowId) return;
    return retainWorkflowSubscription(workflowId);
  }, [bridgeVersion, retainWorkflowSubscription, workflowId]);
}

export function useWorkflowRealtimeConnectionState(): boolean {
  return useContext(RealtimeContext)?.isConnected ?? false;
}

export function useWorkflowsQuery() {
  return useWorkflowsQueryWithInitialData();
}

export function useWorkflowsQueryWithInitialData(initialData?: ReadonlyArray<WorkflowSummary>) {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: workflowsQueryKey,
    queryFn: () => apiClient.fetchWorkflows(),
    initialData,
  });
  useEffect(() => {
    if (!initialData) return;
    queryClient.setQueryData(workflowsQueryKey, initialData);
  }, [initialData, queryClient]);
  return query;
}

export function useWorkflowQuery(workflowId: string, initialData?: WorkflowDto) {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: workflowQueryKey(workflowId),
    queryFn: async () => await apiClient.fetchWorkflow(workflowId),
    enabled: Boolean(workflowId),
    initialData,
    retry: WorkflowQueryRetryPolicy.shouldRetry,
  });
  useEffect(() => {
    if (!workflowId || !initialData) return;
    queryClient.setQueryData(workflowQueryKey(workflowId), initialData);
  }, [initialData, queryClient, workflowId]);
  return query;
}

export function useSetWorkflowActivationMutation(workflowId: string) {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (active: boolean) => await apiClient.patchWorkflowActivation(workflowId, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workflowQueryKey(workflowId) });
      await queryClient.invalidateQueries({ queryKey: workflowsQueryKey });
    },
  });
}

export function useWorkflowRunsQuery(workflowId: string) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: workflowRunsQueryKey(workflowId),
    queryFn: async () => await apiClient.fetchWorkflowRuns(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useWorkflowDebuggerOverlayQuery(workflowId: string) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: workflowDebuggerOverlayQueryKey(workflowId),
    queryFn: async () => await apiClient.fetchWorkflowDebuggerOverlay(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useWorkflowDevBuildStateQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowDevBuildStateQueryKey(workflowId),
    queryFn: async (): Promise<WorkflowDevBuildState> => ({
      state: "idle",
      updatedAt: new Date(0).toISOString(),
    }),
    enabled: false,
    initialData: {
      state: "idle",
      updatedAt: new Date(0).toISOString(),
    } satisfies WorkflowDevBuildState,
  });
}
export function useRunQuery(
  runId: string | null | undefined,
  options: Readonly<{
    disableFetch?: boolean;
    /**
     * @deprecated Was used for HTTP polling. Now a no-op — run state is streamed over
     * WebSocket via WorkflowRunEventWebsocketRelay and spliced into the cache by
     * applyWorkflowEvent. The query refetches on mount and after a WS reconnect for
     * catch-up; the option is retained so callers can be migrated without API churn.
     */
    pollWhileNonTerminalMs?: number;
  }> = {},
) {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  const realtimeContext = useContext(RealtimeContext);
  const query = useQuery({
    queryKey: runId ? runQueryKey(runId) : ["run", "disabled"],
    queryFn: async ({ signal }) => {
      const incoming = await apiClient.fetchRun(runId!, { signal });
      const previous = queryClient.getQueryData<PersistedRunState>(runQueryKey(runId!));
      return resolveFetchedRunState({ incoming, previous });
    },
    enabled: Boolean(runId) && !options.disableFetch,
    // WS events (via WorkflowRunEventWebsocketRelay → applyWorkflowEvent) are the primary path.
    // The poll is a safety net: InlineDrivingScheduler defers execution via setTimeout(0), so
    // the HTTP trigger response carries only the initial queued snapshot, not the final state.
    // Self-cancels once the run is terminal.
    refetchInterval: (query) =>
      resolveRunPollingIntervalMs({
        runState: query.state.data as PersistedRunState | undefined,
        pollWhileNonTerminalMs: options.pollWhileNonTerminalMs,
      }),
    staleTime: 30_000,
  });

  // Refetch once when WS reconnects after a previous disconnect, to catch up on any state
  // changes that happened during the disconnection window. Same shape as
  // useTelemetryRunTraceQuery's reconnect-catchup effect.
  const previousReadyStateRef = useRef(realtimeContext?.readyState);
  useEffect(() => {
    const previousReadyState = previousReadyStateRef.current;
    const currentReadyState = realtimeContext?.readyState;
    previousReadyStateRef.current = currentReadyState;

    const wasDisconnected =
      previousReadyState === RealtimeReadyState.CLOSED || previousReadyState === RealtimeReadyState.CLOSING;
    const isNowOpen = currentReadyState === RealtimeReadyState.OPEN;

    if (wasDisconnected && isNowOpen && runId && !options.disableFetch) {
      void queryClient.invalidateQueries({ queryKey: runQueryKey(runId) });
    }
  }, [realtimeContext?.readyState, runId, options.disableFetch, queryClient]);

  return query;
}

export function useRunDetailQuery(
  runId: string | null | undefined,
  options: Readonly<{ disableFetch?: boolean }> = {},
) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: runId ? runDetailQueryKey(runId) : ["run-detail", "disabled"],
    queryFn: async ({ signal }): Promise<WorkflowRunDetailDto> => await apiClient.fetchRunDetail(runId!, { signal }),
    enabled: Boolean(runId) && !options.disableFetch,
    staleTime: 30_000,
  });
}

export function useCredentialTypesQuery() {
  const apiClient = useWorkflowCanvasApiClientOptional();
  return useQuery({
    queryKey: credentialTypesQueryKey,
    queryFn: () => apiClient!.fetchCredentialTypes(),
    enabled: Boolean(apiClient),
  });
}

export function useCredentialFieldEnvStatusQuery() {
  const apiClient = useWorkflowCanvasApiClientOptional();
  return useQuery({
    queryKey: credentialFieldEnvStatusQueryKey,
    queryFn: () => apiClient!.fetchCredentialFieldEnvStatus(),
    enabled: Boolean(apiClient),
  });
}

export function useCredentialInstancesQuery() {
  const apiClient = useWorkflowCanvasApiClientOptional();
  return useQuery({
    queryKey: credentialInstancesQueryKey,
    queryFn: () => apiClient!.fetchCredentialInstances(),
    enabled: Boolean(apiClient),
  });
}

export function useCredentialAppsQuery() {
  const apiClient = useWorkflowCanvasApiClientOptional();
  return useQuery({
    queryKey: credentialAppsQueryKey,
    queryFn: () => apiClient!.fetchCredentialApps(),
    enabled: Boolean(apiClient),
  });
}

export function useCredentialInstanceWithSecretsQuery(instanceId: string | null | undefined) {
  const apiClient = useWorkflowCanvasApiClientOptional();
  return useQuery({
    queryKey: instanceId
      ? credentialInstanceWithSecretsQueryKey(instanceId)
      : ["credential-instance-with-secrets", "disabled"],
    queryFn: async () => await apiClient!.fetchCredentialInstanceWithSecrets(instanceId!),
    enabled: Boolean(instanceId) && Boolean(apiClient),
  });
}

export function useWorkflowCredentialHealthQuery(workflowId: string) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: workflowCredentialHealthQueryKey(workflowId),
    queryFn: async () => await apiClient.fetchWorkflowCredentialHealth(workflowId),
    enabled: Boolean(workflowId),
    retry: WorkflowQueryRetryPolicy.shouldRetry,
  });
}

export function useUserAccountsQuery() {
  const apiClient = useWorkflowCanvasApiClientOptional();
  return useQuery({
    queryKey: userAccountsQueryKey,
    queryFn: () => apiClient!.fetchUserAccounts(),
    enabled: Boolean(apiClient),
  });
}

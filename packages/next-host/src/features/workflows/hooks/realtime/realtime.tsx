"use client";

export type {
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  WorkflowCredentialHealthDto,
} from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
export type { WorkflowDto, WorkflowSummary } from "@codemation/host-src/application/contracts/WorkflowViewContracts";
export type {
  InviteUserResponseDto,
  UserAccountDto,
  UserAccountStatus,
} from "@codemation/host-src/application/contracts/userDirectoryContracts.types";

export * from "../../lib/realtime/realtimeDomainTypes";

export { WorkflowRealtimeProvider } from "../../components/realtime/WorkflowRealtimeProvider";
export {
  useInviteUserMutation,
  useRegenerateUserInviteMutation,
  useUpdateUserAccountStatusMutation,
} from "./userAccountMutations";

import type { WorkflowDto, WorkflowSummary } from "@codemation/host-src/application/contracts/WorkflowViewContracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";
import { RealtimeContext } from "../../components/realtime/RealtimeContext";
import {
  fetchCredentialFieldEnvStatus,
  fetchCredentialInstanceWithSecrets,
  fetchCredentialInstances,
  fetchCredentialTypes,
  fetchRun,
  fetchRunDetail,
  fetchUserAccounts,
  fetchWorkflow,
  fetchWorkflowCredentialHealth,
  fetchWorkflowDebuggerOverlay,
  fetchWorkflowRuns,
  fetchWorkflows,
  patchWorkflowActivation,
} from "../../lib/realtime/realtimeApi";
import { getRealtimeBridge } from "../../lib/realtime/realtimeClientBridge";
import {
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
} from "../../lib/realtime/realtimeQueryKeys";
import type {
  PersistedRunState,
  WorkflowDevBuildState,
  WorkflowRunDetailDto,
} from "../../lib/realtime/realtimeDomainTypes";
import { WorkflowQueryRetryPolicy } from "../../lib/realtime/WorkflowQueryRetryPolicy";
import { resolveFetchedRunState, resolveRunPollingIntervalMs } from "./runQueryPolling";

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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: workflowsQueryKey,
    queryFn: fetchWorkflows,
    initialData,
  });
  useEffect(() => {
    if (!initialData) return;
    queryClient.setQueryData(workflowsQueryKey, initialData);
  }, [initialData, queryClient]);
  return query;
}

export function useWorkflowQuery(workflowId: string, initialData?: WorkflowDto) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: workflowQueryKey(workflowId),
    queryFn: async () => await fetchWorkflow(workflowId),
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (active: boolean) => await patchWorkflowActivation(workflowId, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workflowQueryKey(workflowId) });
      await queryClient.invalidateQueries({ queryKey: workflowsQueryKey });
    },
  });
}

export function useWorkflowRunsQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowRunsQueryKey(workflowId),
    queryFn: async () => await fetchWorkflowRuns(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useWorkflowDebuggerOverlayQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowDebuggerOverlayQueryKey(workflowId),
    queryFn: async () => await fetchWorkflowDebuggerOverlay(workflowId),
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
  options: Readonly<{ disableFetch?: boolean; pollWhileNonTerminalMs?: number }> = {},
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: runId ? runQueryKey(runId) : ["run", "disabled"],
    queryFn: async ({ signal }) => {
      const incoming = await fetchRun(runId!, { signal });
      const previous = queryClient.getQueryData<PersistedRunState>(runQueryKey(runId!));
      return resolveFetchedRunState({ incoming, previous });
    },
    enabled: Boolean(runId) && !options.disableFetch,
    refetchInterval: (query) =>
      resolveRunPollingIntervalMs({
        runState: query.state.data as PersistedRunState | undefined,
        pollWhileNonTerminalMs: options.pollWhileNonTerminalMs,
      }),
    staleTime: 30_000,
  });
}

export function useRunDetailQuery(
  runId: string | null | undefined,
  options: Readonly<{ disableFetch?: boolean }> = {},
) {
  return useQuery({
    queryKey: runId ? runDetailQueryKey(runId) : ["run-detail", "disabled"],
    queryFn: async ({ signal }): Promise<WorkflowRunDetailDto> => await fetchRunDetail(runId!, { signal }),
    enabled: Boolean(runId) && !options.disableFetch,
    staleTime: 30_000,
  });
}

export function useCredentialTypesQuery() {
  return useQuery({
    queryKey: credentialTypesQueryKey,
    queryFn: fetchCredentialTypes,
  });
}

export function useCredentialFieldEnvStatusQuery() {
  return useQuery({
    queryKey: credentialFieldEnvStatusQueryKey,
    queryFn: fetchCredentialFieldEnvStatus,
  });
}

export function useCredentialInstancesQuery() {
  return useQuery({
    queryKey: credentialInstancesQueryKey,
    queryFn: fetchCredentialInstances,
  });
}

export function useCredentialInstanceWithSecretsQuery(instanceId: string | null | undefined) {
  return useQuery({
    queryKey: instanceId
      ? credentialInstanceWithSecretsQueryKey(instanceId)
      : ["credential-instance-with-secrets", "disabled"],
    queryFn: async () => await fetchCredentialInstanceWithSecrets(instanceId!),
    enabled: Boolean(instanceId),
  });
}

export function useWorkflowCredentialHealthQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowCredentialHealthQueryKey(workflowId),
    queryFn: async () => await fetchWorkflowCredentialHealth(workflowId),
    enabled: Boolean(workflowId),
    retry: WorkflowQueryRetryPolicy.shouldRetry,
  });
}

export function useUserAccountsQuery() {
  return useQuery({
    queryKey: userAccountsQueryKey,
    queryFn: fetchUserAccounts,
  });
}

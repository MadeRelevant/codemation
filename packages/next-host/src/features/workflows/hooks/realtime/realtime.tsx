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

import {
  withInviteUserResponseLoginMethodsDefaults,
  withUserAccountLoginMethodsDefaults,
  type InviteUserResponseDto,
  type UserAccountDto,
  type UserAccountStatus,
} from "@codemation/host-src/application/contracts/userDirectoryContracts.types";
import type { WorkflowDto, WorkflowSummary } from "@codemation/host-src/application/contracts/WorkflowViewContracts";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";

import { codemationApiClient } from "../../../../api/CodemationApiClient";
import { RealtimeContext } from "../../components/realtime/RealtimeContext";
import {
  fetchCredentialFieldEnvStatus,
  fetchCredentialInstanceWithSecrets,
  fetchCredentialInstances,
  fetchCredentialTypes,
  fetchRun,
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
  runQueryKey,
  userAccountsQueryKey,
  workflowCredentialHealthQueryKey,
  workflowDebuggerOverlayQueryKey,
  workflowDevBuildStateQueryKey,
  workflowQueryKey,
  workflowRunsQueryKey,
  workflowsQueryKey,
} from "../../lib/realtime/realtimeQueryKeys";
import type { PersistedRunState, WorkflowDevBuildState } from "../../lib/realtime/realtimeDomainTypes";

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

export function useRunQuery(runId: string | null | undefined, options: Readonly<{ disableFetch?: boolean }> = {}) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: runId ? runQueryKey(runId) : ["run", "disabled"],
    queryFn: async ({ signal }) => {
      const incoming = await fetchRun(runId!, { signal });
      const previous = queryClient.getQueryData<PersistedRunState>(runQueryKey(runId!));
      if (previous) {
        if (previous.status === "completed" && incoming.status !== "completed") {
          return previous;
        }
        if (previous.status === "failed" && incoming.status === "pending") {
          return previous;
        }
        if (previous.status === "running" && incoming.status === "pending") {
          return previous;
        }
      }
      return incoming;
    },
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
  });
}

export function useUserAccountsQuery() {
  return useQuery({
    queryKey: userAccountsQueryKey,
    queryFn: fetchUserAccounts,
  });
}

export function useInviteUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string): Promise<InviteUserResponseDto> => {
      const body = await codemationApiClient.postJson<InviteUserResponseDto>(ApiPaths.userInvites(), { email });
      return withInviteUserResponseLoginMethodsDefaults(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userAccountsQueryKey });
    },
  });
}

export function useRegenerateUserInviteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string): Promise<InviteUserResponseDto> => {
      const body = await codemationApiClient.postJson<InviteUserResponseDto>(ApiPaths.userInviteRegenerate(userId));
      return withInviteUserResponseLoginMethodsDefaults(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userAccountsQueryKey });
    },
  });
}

export function useUpdateUserAccountStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: Readonly<{ userId: string; status: UserAccountStatus }>): Promise<UserAccountDto> => {
      const body = await codemationApiClient.patchJson<UserAccountDto>(ApiPaths.userStatus(args.userId), {
        status: args.status,
      });
      return withUserAccountLoginMethodsDefaults(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userAccountsQueryKey });
    },
  });
}

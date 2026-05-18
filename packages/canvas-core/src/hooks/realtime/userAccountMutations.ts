"use client";

import {
  withInviteUserResponseLoginMethodsDefaults,
  withUserAccountLoginMethodsDefaults,
  type InviteUserResponseDto,
  type UserAccountDto,
  type UserAccountStatus,
} from "@codemation/host/dto";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userAccountsQueryKey } from "../../realtime/realtimeQueryKeys";
import { useWorkflowCanvasApiClient } from "../../context/WorkflowCanvasApiClientContext";

export function useInviteUserMutation() {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string): Promise<InviteUserResponseDto> => {
      const body = await apiClient.postUserInvite(email);
      return withInviteUserResponseLoginMethodsDefaults(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userAccountsQueryKey });
    },
  });
}

export function useRegenerateUserInviteMutation() {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string): Promise<InviteUserResponseDto> => {
      const body = await apiClient.postUserInviteRegenerate(userId);
      return withInviteUserResponseLoginMethodsDefaults(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userAccountsQueryKey });
    },
  });
}

export function useUpdateUserAccountStatusMutation() {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: Readonly<{ userId: string; status: UserAccountStatus }>): Promise<UserAccountDto> => {
      const body = await apiClient.patchUserStatus(args.userId, args.status);
      return withUserAccountLoginMethodsDefaults(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userAccountsQueryKey });
    },
  });
}

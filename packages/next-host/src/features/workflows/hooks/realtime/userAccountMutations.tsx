"use client";

import {
  withInviteUserResponseLoginMethodsDefaults,
  withUserAccountLoginMethodsDefaults,
  type InviteUserResponseDto,
  type UserAccountDto,
  type UserAccountStatus,
} from "@codemation/host-src/application/contracts/userDirectoryContracts.types";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { codemationApiClient } from "../../../../api/CodemationApiClient";
import { userAccountsQueryKey } from "../../lib/realtime/realtimeQueryKeys";

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

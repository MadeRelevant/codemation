export type UserAccountStatus = "invited" | "active" | "inactive";

export type UserAccountDto = Readonly<{
  id: string;
  email: string;
  status: UserAccountStatus;
  inviteExpiresAt: string | null;
  /** Ways the user can sign in (password + linked OAuth / OIDC / email-link accounts). */
  loginMethods: ReadonlyArray<string>;
}>;

/** Wire/cache payloads may omit `loginMethods` (older servers or partial JSON). */
export type UserAccountDtoInput = Readonly<
  Omit<UserAccountDto, "loginMethods"> & { loginMethods?: ReadonlyArray<string> | undefined }
>;

export type InviteUserResponseDto = Readonly<{
  user: UserAccountDto;
  inviteUrl: string;
}>;

export function withUserAccountLoginMethodsDefaults(input: UserAccountDtoInput): UserAccountDto {
  const loginMethods = input.loginMethods;
  return {
    ...input,
    loginMethods: Array.isArray(loginMethods) ? loginMethods : [],
  };
}

export function withInviteUserResponseLoginMethodsDefaults(
  input: Readonly<{ user: UserAccountDtoInput; inviteUrl: string }>,
): InviteUserResponseDto {
  return {
    inviteUrl: input.inviteUrl,
    user: withUserAccountLoginMethodsDefaults(input.user),
  };
}

export type VerifyUserInviteResponseDto = Readonly<{
  valid: boolean;
  email?: string;
}>;

export type InviteUserRequestDto = Readonly<{
  email: string;
}>;

export type AcceptUserInviteRequestDto = Readonly<{
  token: string;
  password: string;
}>;

export type UpdateUserAccountStatusRequestDto = Readonly<{
  status: UserAccountStatus;
}>;

/** Result of CLI/bootstrap `upsert` for a local password user (distinct from invite-based onboarding). */
export type UpsertLocalBootstrapUserResultDto = Readonly<{
  outcome: "created" | "updated";
}>;

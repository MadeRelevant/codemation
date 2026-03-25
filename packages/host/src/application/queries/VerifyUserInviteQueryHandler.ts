import { inject } from "@codemation/core";

import type { VerifyUserInviteResponseDto } from "../contracts/userDirectoryContracts.types";

import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";

import { UserAccountService } from "../../domain/users/UserAccountServiceRegistry";
import { VerifyUserInviteQuery } from "./VerifyUserInviteQuery";

@HandlesQuery.for(VerifyUserInviteQuery)
export class VerifyUserInviteQueryHandler extends QueryHandler<VerifyUserInviteQuery, VerifyUserInviteResponseDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(query: VerifyUserInviteQuery): Promise<VerifyUserInviteResponseDto> {
    return await this.userAccounts.verifyInviteToken(query.token);
  }
}

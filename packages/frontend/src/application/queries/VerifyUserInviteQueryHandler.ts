import { inject } from "@codemation/core";

import type {
VerifyUserInviteResponseDto
} from "../contracts/UserDirectoryContracts";


import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";

import { UserAccountService } from "../../domain/users/UserAccountService";
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

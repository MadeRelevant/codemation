import { inject } from "@codemation/core";
import type {
  UserAccountDto,
  VerifyUserInviteResponseDto,
} from "../contracts/UserDirectoryContracts";
import { Query } from "../bus/Query";
import { QueryHandler } from "../bus/QueryHandler";
import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";
import { UserAccountService } from "../../domain/users/UserAccountService";

export class ListUserAccountsQuery extends Query<ReadonlyArray<UserAccountDto>> {}

export class VerifyUserInviteQuery extends Query<VerifyUserInviteResponseDto> {
  constructor(public readonly token: string) {
    super();
  }
}

@HandlesQuery.for(ListUserAccountsQuery)
export class ListUserAccountsQueryHandler extends QueryHandler<ListUserAccountsQuery, ReadonlyArray<UserAccountDto>> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(_query: ListUserAccountsQuery): Promise<ReadonlyArray<UserAccountDto>> {
    return await this.userAccounts.listUsers();
  }
}

@HandlesQuery.for(VerifyUserInviteQuery)
export class VerifyUserInviteQueryHandler extends QueryHandler<VerifyUserInviteQuery, VerifyUserInviteResponseDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(query: VerifyUserInviteQuery): Promise<VerifyUserInviteResponseDto> {
    return await this.userAccounts.verifyInviteToken(query.token);
  }
}

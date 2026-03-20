import { inject } from "@codemation/core";

import type {
UserAccountDto
} from "../contracts/userDirectoryContracts.types";


import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";

import { UserAccountService } from "../../domain/users/UserAccountServiceRegistry";

import { ListUserAccountsQuery } from "./UserAccountQueryHandlers";



@HandlesQuery.for(ListUserAccountsQuery)
export class ListUserAccountsQueryHandler extends QueryHandler<ListUserAccountsQuery, ReadonlyArray<UserAccountDto>> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(_query: ListUserAccountsQuery): Promise<ReadonlyArray<UserAccountDto>> {
    return await this.userAccounts.listUsers();
  }
}

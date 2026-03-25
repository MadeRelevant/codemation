import { inject } from "@codemation/core";

import type { CredentialInstanceDto } from "../contracts/CredentialContractsRegistry";

import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";

import { CredentialInstanceService } from "../../domain/credentials/CredentialServices";
import { ListCredentialInstancesQuery } from "./ListCredentialInstancesQuery";

@HandlesQuery.for(ListCredentialInstancesQuery)
export class ListCredentialInstancesQueryHandler extends QueryHandler<
  ListCredentialInstancesQuery,
  ReadonlyArray<CredentialInstanceDto>
> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(): Promise<ReadonlyArray<CredentialInstanceDto>> {
    return await this.credentialInstanceService.listInstances();
  }
}

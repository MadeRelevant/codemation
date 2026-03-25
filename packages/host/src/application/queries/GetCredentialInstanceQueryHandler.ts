import { inject } from "@codemation/core";

import type { CredentialInstanceDto } from "../contracts/CredentialContractsRegistry";

import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";

import { CredentialInstanceService } from "../../domain/credentials/CredentialServices";
import { GetCredentialInstanceQuery } from "./GetCredentialInstanceQuery";

@HandlesQuery.for(GetCredentialInstanceQuery)
export class GetCredentialInstanceQueryHandler extends QueryHandler<
  GetCredentialInstanceQuery,
  CredentialInstanceDto | undefined
> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(query: GetCredentialInstanceQuery): Promise<CredentialInstanceDto | undefined> {
    return await this.credentialInstanceService.getInstance(query.instanceId);
  }
}

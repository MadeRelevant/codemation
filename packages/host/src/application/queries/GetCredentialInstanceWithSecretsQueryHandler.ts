import { inject } from "@codemation/core";

import type { CredentialInstanceWithSecretsDto } from "../contracts/CredentialContractsRegistry";

import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";

import { CredentialInstanceService } from "../../domain/credentials/CredentialServices";
import { GetCredentialInstanceWithSecretsQuery } from "./GetCredentialInstanceWithSecretsQuery";

@HandlesQuery.for(GetCredentialInstanceWithSecretsQuery)
export class GetCredentialInstanceWithSecretsQueryHandler extends QueryHandler<
  GetCredentialInstanceWithSecretsQuery,
  CredentialInstanceWithSecretsDto | undefined
> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(query: GetCredentialInstanceWithSecretsQuery): Promise<CredentialInstanceWithSecretsDto | undefined> {
    return await this.credentialInstanceService.getInstanceWithSecrets(query.instanceId);
  }
}

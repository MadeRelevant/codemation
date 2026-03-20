import type { CredentialTypeDefinition } from "@codemation/core";

import { inject } from "@codemation/core";



import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";

import { CredentialTypeRegistryImpl } from "../../domain/credentials/CredentialServices";

import { ListCredentialTypesQuery } from "./CredentialQueryHandlers";



@HandlesQuery.for(ListCredentialTypesQuery)
export class ListCredentialTypesQueryHandler extends QueryHandler<ListCredentialTypesQuery, ReadonlyArray<CredentialTypeDefinition>> {
  constructor(
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
  ) {
    super();
  }

  async execute(): Promise<ReadonlyArray<CredentialTypeDefinition>> {
    return this.credentialTypeRegistry.listTypes();
  }
}

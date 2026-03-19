import type { CredentialTypeDefinition } from "@codemation/core";
import { inject } from "@codemation/core";
import type {
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  WorkflowCredentialHealthDto,
} from "../contracts/CredentialContracts";
import { Query } from "../bus/Query";
import { QueryHandler } from "../bus/QueryHandler";
import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";
import { CredentialBindingService, CredentialInstanceService, CredentialTypeRegistryImpl } from "../../domain/credentials/CredentialServices";

export class ListCredentialTypesQuery extends Query<ReadonlyArray<CredentialTypeDefinition>> {}

export class ListCredentialInstancesQuery extends Query<ReadonlyArray<CredentialInstanceDto>> {}

export class GetCredentialInstanceQuery extends Query<CredentialInstanceDto | undefined> {
  constructor(public readonly instanceId: string) {
    super();
  }
}

export class GetCredentialInstanceWithSecretsQuery extends Query<CredentialInstanceWithSecretsDto | undefined> {
  constructor(public readonly instanceId: string) {
    super();
  }
}

export class GetWorkflowCredentialHealthQuery extends Query<WorkflowCredentialHealthDto> {
  constructor(public readonly workflowId: string) {
    super();
  }
}

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

@HandlesQuery.for(ListCredentialInstancesQuery)
export class ListCredentialInstancesQueryHandler extends QueryHandler<ListCredentialInstancesQuery, ReadonlyArray<CredentialInstanceDto>> {
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

@HandlesQuery.for(GetCredentialInstanceQuery)
export class GetCredentialInstanceQueryHandler extends QueryHandler<GetCredentialInstanceQuery, CredentialInstanceDto | undefined> {
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

@HandlesQuery.for(GetWorkflowCredentialHealthQuery)
export class GetWorkflowCredentialHealthQueryHandler extends QueryHandler<GetWorkflowCredentialHealthQuery, WorkflowCredentialHealthDto> {
  constructor(
    @inject(CredentialBindingService)
    private readonly credentialBindingService: CredentialBindingService,
  ) {
    super();
  }

  async execute(query: GetWorkflowCredentialHealthQuery): Promise<WorkflowCredentialHealthDto> {
    return await this.credentialBindingService.listWorkflowHealth(query.workflowId);
  }
}

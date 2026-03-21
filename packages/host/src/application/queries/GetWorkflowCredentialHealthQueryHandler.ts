
import { inject } from "@codemation/core";

import type {
WorkflowCredentialHealthDto
} from "../contracts/CredentialContractsRegistry";


import { QueryHandler } from "../bus/QueryHandler";

import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";

import { CredentialBindingService } from "../../domain/credentials/CredentialServices";
import { GetWorkflowCredentialHealthQuery } from "./GetWorkflowCredentialHealthQuery";



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

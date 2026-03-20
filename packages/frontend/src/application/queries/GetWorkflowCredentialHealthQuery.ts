

import type {
WorkflowCredentialHealthDto
} from "../contracts/CredentialContracts";

import { Query } from "../bus/Query";






export class GetWorkflowCredentialHealthQuery extends Query<WorkflowCredentialHealthDto> {
  constructor(public readonly workflowId: string) {
    super();
  }
}

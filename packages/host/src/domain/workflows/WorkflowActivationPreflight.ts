import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import { CoreTokens, inject, injectable, type WorkflowRepository } from "@codemation/core";
import { CredentialBindingService } from "../credentials/CredentialServices";
import { WorkflowActivationPreflightRules } from "./WorkflowActivationPreflightRules";

@injectable()
export class WorkflowActivationPreflight {
  constructor(
    @inject(CoreTokens.WorkflowRepository)
    private readonly workflowRepository: WorkflowRepository,
    @inject(CredentialBindingService)
    private readonly credentialBindingService: CredentialBindingService,
    @inject(WorkflowActivationPreflightRules)
    private readonly rules: WorkflowActivationPreflightRules,
  ) {}

  async assertCanActivate(workflowId: string): Promise<void> {
    const decodedId = decodeURIComponent(workflowId);
    const workflow = this.workflowRepository.get(decodedId);
    if (!workflow) {
      throw new ApplicationRequestError(404, `Unknown workflowId: ${decodedId}`);
    }
    const health = await this.credentialBindingService.listWorkflowHealth(decodedId);
    const errors = [
      ...this.rules.collectNonManualTriggerErrors(workflow),
      ...this.rules.collectRequiredCredentialErrors(health),
    ];
    if (errors.length > 0) {
      throw new ApplicationRequestError(400, "Workflow cannot be activated.", errors);
    }
  }
}

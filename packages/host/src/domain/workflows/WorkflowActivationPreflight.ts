import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import { ApplicationTokens } from "../../applicationTokens";
import { CoreTokens, inject, injectable, type CredentialTypeRegistry, type WorkflowRepository } from "@codemation/core";
import { CredentialBindingService } from "../credentials/CredentialServices";
import { CredentialOAuth2ScopeResolver } from "../credentials/CredentialOAuth2ScopeResolver";
import type { CredentialStore } from "../credentials/CredentialServices";
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
    @inject(CoreTokens.CredentialTypeRegistry)
    private readonly credentialTypeRegistry: CredentialTypeRegistry,
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialOAuth2ScopeResolver)
    private readonly credentialOAuth2ScopeResolver: CredentialOAuth2ScopeResolver,
  ) {}

  async assertCanActivate(workflowId: string): Promise<void> {
    const decodedId = decodeURIComponent(workflowId);
    const workflow = this.workflowRepository.get(decodedId);
    if (!workflow) {
      throw new ApplicationRequestError(404, `Unknown workflowId: ${decodedId}`);
    }
    const health = await this.credentialBindingService.listWorkflowHealth(decodedId);
    const scopeErrors = await this.rules.collectScopeMismatchErrors(health, {
      getRequiredScopes: (typeId, _requirement) => {
        const type = this.credentialTypeRegistry.getType(typeId);
        if (type?.auth?.kind === "oauth2") {
          return this.credentialOAuth2ScopeResolver.resolveRequestedScopes(type.auth, {});
        }
        return [];
      },
      getGrantedScopes: async (instanceId) => {
        const material = await this.credentialStore.getOAuth2Material(instanceId);
        return material?.scopes ?? [];
      },
    });
    const errors = [
      ...this.rules.collectNonManualTriggerErrors(workflow),
      ...this.rules.collectRequiredCredentialErrors(health),
      ...scopeErrors,
    ];
    if (errors.length > 0) {
      throw new ApplicationRequestError(400, "Workflow cannot be activated.", errors);
    }
  }
}

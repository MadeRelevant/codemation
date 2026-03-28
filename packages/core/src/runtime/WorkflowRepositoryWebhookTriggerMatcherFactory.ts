import type { WebhookTriggerRoutingDiagnostics, WorkflowActivationPolicy, WorkflowRepository } from "../types";

import { WorkflowRepositoryWebhookTriggerMatcher } from "./WorkflowRepositoryWebhookTriggerMatcher";

export class WorkflowRepositoryWebhookTriggerMatcherFactory {
  create(
    workflowRepository: WorkflowRepository,
    workflowActivationPolicy: WorkflowActivationPolicy,
    diagnostics?: WebhookTriggerRoutingDiagnostics,
  ): WorkflowRepositoryWebhookTriggerMatcher {
    return new WorkflowRepositoryWebhookTriggerMatcher(workflowRepository, workflowActivationPolicy, diagnostics);
  }
}

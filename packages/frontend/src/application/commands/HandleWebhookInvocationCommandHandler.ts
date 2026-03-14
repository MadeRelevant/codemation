import type { WebhookRunResult } from "@codemation/core";
import { Engine, inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WebhookEndpointRepository } from "../../domain/webhooks/WebhookEndpointRepository";
import type { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import { HandleWebhookInvocationCommand } from "./HandleWebhookInvocationCommand";

@HandlesCommand.for(HandleWebhookInvocationCommand)
export class HandleWebhookInvocationCommandHandler extends CommandHandler<HandleWebhookInvocationCommand, unknown> {
  constructor(
    @inject(Engine)
    private readonly engine: Engine,
    @inject(ApplicationTokens.WorkflowDefinitionRepository)
    private readonly workflowDefinitionRepository: WorkflowDefinitionRepository,
    @inject(ApplicationTokens.WebhookEndpointRepository)
    private readonly webhookEndpointRepository: WebhookEndpointRepository,
  ) {
    super();
  }

  async execute(command: HandleWebhookInvocationCommand): Promise<unknown> {
    const entry = await this.webhookEndpointRepository.get(decodeURIComponent(command.endpointId));
    if (!entry) {
      throw new ApplicationRequestError(404, "Unknown webhook endpoint");
    }
    const requestMethod = command.requestMethod.toUpperCase() as typeof entry.methods[number];
    if (!entry.methods.includes(requestMethod)) {
      throw new ApplicationRequestError(405, "Method not allowed");
    }
    const workflow = await this.workflowDefinitionRepository.getDefinition(entry.workflowId);
    if (!workflow) {
      throw new ApplicationRequestError(404, "Unknown workflow for webhook endpoint");
    }
    try {
      const scheduled = await this.engine.runWorkflow(workflow, entry.nodeId, [command.requestItem], undefined, {
        localOnly: true,
        webhook: true,
      });
      if (scheduled.status === "failed") {
        throw new Error(scheduled.error.message);
      }
      const result =
        scheduled.status === "completed"
          ? ({
              runId: scheduled.runId,
              workflowId: scheduled.workflowId,
              startedAt: scheduled.startedAt,
              runStatus: "completed",
              response: scheduled.outputs,
            } satisfies WebhookRunResult)
          : await Promise.race([
              this.engine.waitForWebhookResponse(scheduled.runId),
              this.engine.waitForCompletion(scheduled.runId).then((completed) => {
                if (completed.status === "failed") {
                  throw new Error(completed.error.message);
                }
                return {
                  runId: completed.runId,
                  workflowId: completed.workflowId,
                  startedAt: completed.startedAt,
                  runStatus: "completed" as const,
                  response: completed.outputs,
                } satisfies WebhookRunResult;
              }),
            ]);
      return result.response.at(-1)?.json ?? null;
    } catch (error) {
      if (error instanceof ApplicationRequestError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ApplicationRequestError(400, message);
    }
  }
}

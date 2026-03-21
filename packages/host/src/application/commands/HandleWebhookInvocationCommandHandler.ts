import type { WebhookRunResult } from "@codemation/core";
import { RunIntentService,inject } from "@codemation/core";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import { HandleWebhookInvocationCommand } from "./HandleWebhookInvocationCommand";

@HandlesCommand.for(HandleWebhookInvocationCommand)
export class HandleWebhookInvocationCommandHandler extends CommandHandler<HandleWebhookInvocationCommand, unknown> {
  constructor(
    @inject(RunIntentService)
    private readonly runIntentService: RunIntentService,
  ) {
    super();
  }

  async execute(command: HandleWebhookInvocationCommand): Promise<unknown> {
    try {
      const requestMethod = command.requestMethod.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      const endpointId = decodeURIComponent(command.endpointId);
      const match = this.runIntentService.findWebhookTrigger(endpointId);
      if (!match) {
        throw new ApplicationRequestError(404, "Unknown webhook endpoint");
      }
      if (!match.methods.includes(requestMethod)) {
        throw new ApplicationRequestError(405, "Method not allowed");
      }
      const result = (await this.runIntentService.runWebhookMatch({
        match,
        requestItem: command.requestItem,
      })) satisfies WebhookRunResult;
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

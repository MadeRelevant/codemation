import type { WebhookRunResult } from "@codemation/core";
import { inject } from "@codemation/core";
import { RunIntentService } from "@codemation/core/bootstrap";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import { HandleWebhookInvocationCommand } from "./HandleWebhookInvocationCommand";

@HandlesCommand.forCommand(HandleWebhookInvocationCommand)
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
      const endpointPath = decodeURIComponent(command.endpointPath);
      const resolution = this.runIntentService.resolveWebhookTrigger({ endpointPath, method: requestMethod });
      if (resolution.status === "notFound") {
        throw new ApplicationRequestError(404, "Unknown webhook endpoint");
      }
      if (resolution.status === "methodNotAllowed") {
        throw new ApplicationRequestError(405, "Method not allowed");
      }
      const result = (await this.runIntentService.runWebhookMatch({
        match: resolution.match,
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

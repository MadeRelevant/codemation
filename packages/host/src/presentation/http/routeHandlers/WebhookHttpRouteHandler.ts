import { RunIntentService, inject, injectable } from "@codemation/core";
import type { CommandBus } from "../../../application/bus/CommandBus";
import { HandleWebhookInvocationCommand } from "../../../application/commands/HandleWebhookInvocationCommand";
import { ApplicationTokens } from "../../../applicationTokens";
import { RequestToWebhookItemMapper } from "../../../infrastructure/webhooks/RequestToWebhookItemMapper";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class WebhookHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
    @inject(RunIntentService)
    private readonly runIntentService: RunIntentService,
    @inject(RequestToWebhookItemMapper)
    private readonly requestToWebhookItemMapper: RequestToWebhookItemMapper,
  ) {}

  async postWebhook(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const endpointPath = decodeURIComponent(params.endpointPath ?? "");
      const method = request.method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      const resolution = this.runIntentService.resolveWebhookTrigger({ endpointPath, method });
      if (resolution.status === "notFound") {
        return Response.json({ error: "Unknown webhook endpoint" }, { status: 404 });
      }
      if (resolution.status === "methodNotAllowed") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }
      const requestItem = await this.requestToWebhookItemMapper.map(request, resolution.match);
      return Response.json(
        await this.commandBus.execute(
          new HandleWebhookInvocationCommand(endpointPath, request.method.toUpperCase(), requestItem),
        ),
      );
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }
}

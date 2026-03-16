import type { CommandBus } from "../../../application/bus/CommandBus";
import { HandleWebhookInvocationCommand } from "../../../application/commands/HandleWebhookInvocationCommand";
import { ApplicationTokens } from "../../../applicationTokens";
import { RequestToWebhookItemMapper } from "../../../infrastructure/webhooks/RequestToWebhookItemMapper";
import { RunIntentService, inject } from "@codemation/core";
import { HandlesHttpRoute } from "../HandlesHttpRoute";
import { Route } from "../Route";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@HandlesHttpRoute.for()
export class WebhookHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
    @inject(RunIntentService)
    private readonly runIntentService: RunIntentService,
    @inject(RequestToWebhookItemMapper)
    private readonly requestToWebhookItemMapper: RequestToWebhookItemMapper,
  ) {}

  @Route.for("GET", "webhooks/:endpointId")
  @Route.for("POST", "webhooks/:endpointId")
  @Route.for("PUT", "webhooks/:endpointId")
  @Route.for("PATCH", "webhooks/:endpointId")
  @Route.for("DELETE", "webhooks/:endpointId")
  async postWebhook(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const match = this.runIntentService.matchWebhookTrigger({
        endpointId: decodeURIComponent(params.endpointId!),
        method: request.method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      });
      const requestItem = await this.requestToWebhookItemMapper.map(request, match?.parseJsonBody);
      return Response.json(
        await this.commandBus.execute(
          new HandleWebhookInvocationCommand(params.endpointId!, request.method.toUpperCase(), requestItem),
        ),
      );
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }
}

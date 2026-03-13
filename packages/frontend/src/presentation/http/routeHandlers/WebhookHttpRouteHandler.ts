import type { CommandBus } from "../../../application/bus/CommandBus";
import { HandleWebhookInvocationCommand } from "../../../application/commands/HandleWebhookInvocationCommand";
import { ApplicationTokens } from "../../../applicationTokens";
import type { WebhookEndpointRepository } from "../../../domain/webhooks/WebhookEndpointRepository";
import { RequestToWebhookItemMapper } from "../../../infrastructure/webhooks/RequestToWebhookItemMapper";
import { inject } from "@codemation/core";
import { HandlesHttpRoute } from "../HandlesHttpRoute";
import { Route } from "../Route";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@HandlesHttpRoute.for()
export class WebhookHttpRouteHandler {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly requestToWebhookItemMapper: RequestToWebhookItemMapper,
    @inject(ApplicationTokens.WebhookEndpointRepository)
    private readonly webhookEndpointRepository: WebhookEndpointRepository,
  ) {}

  @Route.for("GET", "webhooks/:endpointId")
  @Route.for("POST", "webhooks/:endpointId")
  @Route.for("PUT", "webhooks/:endpointId")
  @Route.for("PATCH", "webhooks/:endpointId")
  @Route.for("DELETE", "webhooks/:endpointId")
  async postWebhook(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const entry = await this.webhookEndpointRepository.get(decodeURIComponent(params.endpointId!));
      const requestItem = await this.requestToWebhookItemMapper.map(request, entry?.parseJsonBody);
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

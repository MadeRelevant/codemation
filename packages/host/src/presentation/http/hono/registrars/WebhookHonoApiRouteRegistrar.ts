import { inject, injectable } from "@codemation/core";
import type { Context } from "hono";
import { Hono } from "hono";
import { WebhookHttpRouteHandler } from "../../routeHandlers/WebhookHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
export class WebhookHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(WebhookHttpRouteHandler) private readonly handler: WebhookHttpRouteHandler) {}

  register(app: Hono): void {
    const path = "/webhooks/:endpointPath";
    const handle = (c: Context) =>
      this.handler.postWebhook(c.req.raw, { endpointPath: c.req.param("endpointPath") ?? "" });
    app.get(path, handle);
    app.post(path, handle);
    app.put(path, handle);
    app.patch(path, handle);
    app.delete(path, handle);
  }
}

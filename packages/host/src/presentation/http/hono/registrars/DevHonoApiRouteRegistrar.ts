import { inject, injectable } from "@codemation/core";
import { Hono } from "hono";
import { DevBootstrapSummaryHttpRouteHandler } from "../../routeHandlers/DevBootstrapSummaryHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
export class DevHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(
    @inject(DevBootstrapSummaryHttpRouteHandler) private readonly handler: DevBootstrapSummaryHttpRouteHandler,
  ) {}

  register(app: Hono): void {
    app.get("/dev/bootstrap-summary", () => this.handler.getSummary());
  }
}

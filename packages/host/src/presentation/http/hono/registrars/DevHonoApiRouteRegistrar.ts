import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { DevBootstrapSummaryHttpRouteHandler } from "../../routeHandlers/DevBootstrapSummaryHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: DevHonoApiRouteRegistrar }])
export class DevHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(
    @inject(DevBootstrapSummaryHttpRouteHandler) private readonly handler: DevBootstrapSummaryHttpRouteHandler,
  ) {}

  register(app: Hono): void {
    app.get("/dev/bootstrap-summary", () => this.handler.getSummary());
  }
}

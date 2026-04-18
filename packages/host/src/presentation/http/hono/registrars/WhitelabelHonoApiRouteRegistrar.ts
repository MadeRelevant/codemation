import { inject, injectable } from "@codemation/core";
import { Hono } from "hono";
import { WhitelabelLogoHttpRouteHandler } from "../../routeHandlers/WhitelabelLogoHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
export class WhitelabelHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(
    @inject(WhitelabelLogoHttpRouteHandler)
    private readonly whitelabelLogoHttpRouteHandler: WhitelabelLogoHttpRouteHandler,
  ) {}

  register(app: Hono): void {
    app.get("/whitelabel/logo", () => this.whitelabelLogoHttpRouteHandler.getLogo());
  }
}

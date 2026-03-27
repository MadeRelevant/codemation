import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { WhitelabelLogoHttpRouteHandler } from "../../routeHandlers/WhitelabelLogoHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: WhitelabelHonoApiRouteRegistrar }])
export class WhitelabelHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(
    @inject(WhitelabelLogoHttpRouteHandler)
    private readonly whitelabelLogoHttpRouteHandler: WhitelabelLogoHttpRouteHandler,
  ) {}

  register(app: Hono): void {
    app.get("/whitelabel/logo", () => this.whitelabelLogoHttpRouteHandler.getLogo());
  }
}

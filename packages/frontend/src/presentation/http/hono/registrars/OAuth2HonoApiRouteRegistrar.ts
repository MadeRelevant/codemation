import { inject,injectable,registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { OAuth2HttpRouteHandler } from "../../routeHandlers/OAuth2HttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: OAuth2HonoApiRouteRegistrar }])
export class OAuth2HonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(OAuth2HttpRouteHandler) private readonly handler: OAuth2HttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/oauth2/auth", (c) => this.handler.getAuthRedirect(c.req.raw));
    app.get("/oauth2/callback", (c) => this.handler.getCallback(c.req.raw));
    app.get("/oauth2/redirect-uri", (c) => this.handler.getRedirectUri(c.req.raw));
    app.post("/oauth2/disconnect", (c) => this.handler.postDisconnect(c.req.raw));
  }
}

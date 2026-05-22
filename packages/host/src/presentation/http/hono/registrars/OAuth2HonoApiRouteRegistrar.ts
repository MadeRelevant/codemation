import { inject, injectable } from "@codemation/core";
import { Hono } from "hono";
import { OAuth2HttpRouteHandler } from "../../routeHandlers/OAuth2HttpRouteHandlerFactory";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
export class OAuth2HonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(OAuth2HttpRouteHandler) private readonly handler: OAuth2HttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/oauth2/auth", (c) => this.handler.getAuthRedirect(c.req.raw));
    // The Connect dialog displays /api/oauth2/callback (also returned by /oauth2/redirect-uri),
    // and operators register that URL with their OAuth provider. Route it to the new
    // OAuthFlowExecutor-based handler; the legacy `getCallback` method is unreachable from HTTP
    // now (still callable directly from any remaining OAuth2ConnectService callers).
    app.get("/oauth2/callback", (c) => this.handler.getOAuthCallback(c.req.raw));
    app.get("/oauth2/redirect-uri", (c) => this.handler.getRedirectUri(c.req.raw));
    app.post("/oauth2/disconnect", (c) => this.handler.postDisconnect(c.req.raw));
    app.post("/credentials/oauth/start", (c) => this.handler.postOAuthStart(c.req.raw));
    app.get("/credentials/oauth/callback", (c) => this.handler.getOAuthCallback(c.req.raw));
  }
}

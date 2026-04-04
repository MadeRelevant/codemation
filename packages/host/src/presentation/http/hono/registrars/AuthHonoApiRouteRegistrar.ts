import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { AuthHttpRouteHandler } from "../../routeHandlers/AuthHttpRouteHandlerFactory";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: AuthHonoApiRouteRegistrar }])
export class AuthHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(AuthHttpRouteHandler) private readonly handler: AuthHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/auth/session", (c) => this.handler.getSession(c.req.raw));
    app.post("/auth/login", (c) => this.handler.postLogin(c.req.raw));
    app.post("/auth/logout", (c) => this.handler.postLogout(c.req.raw));
    app.get("/auth/oauth/:providerId/start", (c) =>
      this.handler.getOAuthStart(c.req.raw, { providerId: c.req.param("providerId") }),
    );
    app.get("/auth/oauth/:providerId/callback", (c) =>
      this.handler.getOAuthCallback(c.req.raw, { providerId: c.req.param("providerId") }),
    );
    app.get("/auth/callback/:providerId", (c) =>
      this.handler.getOAuthCallback(c.req.raw, { providerId: c.req.param("providerId") }),
    );
    app.post("/auth/callback/:providerId", (c) =>
      this.handler.getOAuthCallback(c.req.raw, { providerId: c.req.param("providerId") }),
    );
  }
}

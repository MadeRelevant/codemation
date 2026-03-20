import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { UserHttpRouteHandler } from "../../routeHandlers/UserHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: UserHonoApiRouteRegistrar }])
export class UserHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(UserHttpRouteHandler) private readonly handler: UserHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/users/invites/verify", (c) => this.handler.getInviteVerify(c.req.raw));
    app.post("/users/invites/accept", (c) => this.handler.postAcceptInvite(c.req.raw));
    app.get("/users", (c) => this.handler.getUsers());
    app.post("/users/invites", (c) => this.handler.postInvite(c.req.raw));
    app.post("/users/:userId/invites/regenerate", (c) =>
      this.handler.postRegenerateInvite(c.req.raw, { userId: c.req.param("userId") }),
    );
    app.patch("/users/:userId/status", (c) =>
      this.handler.patchUserStatus(c.req.raw, { userId: c.req.param("userId") }),
    );
  }
}

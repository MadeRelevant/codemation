import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { CredentialHttpRouteHandler } from "../../routeHandlers/CredentialHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: CredentialHonoApiRouteRegistrar }])
export class CredentialHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(CredentialHttpRouteHandler) private readonly handler: CredentialHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/credentials/types", (_c) => this.handler.getCredentialTypes());
    app.get("/credentials/env-status", (_c) => this.handler.getCredentialFieldEnvStatus());
    app.get("/credentials/instances", (_c) => this.handler.getCredentialInstances());
    app.get("/workflows/:workflowId/credential-health", (c) =>
      this.handler.getWorkflowCredentialHealth(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
    app.get("/credentials/instances/:instanceId", (c) =>
      this.handler.getCredentialInstance(c.req.raw, { instanceId: c.req.param("instanceId") }),
    );
    app.post("/credentials/instances", (c) => this.handler.postCredentialInstance(c.req.raw));
    app.put("/credentials/instances/:instanceId", (c) =>
      this.handler.putCredentialInstance(c.req.raw, { instanceId: c.req.param("instanceId") }),
    );
    app.delete("/credentials/instances/:instanceId", (c) =>
      this.handler.deleteCredentialInstance(c.req.raw, { instanceId: c.req.param("instanceId") }),
    );
    app.put("/credential-bindings", (c) => this.handler.putCredentialBinding(c.req.raw));
    app.post("/credentials/instances/:instanceId/test", (c) =>
      this.handler.postCredentialInstanceTest(c.req.raw, { instanceId: c.req.param("instanceId") }),
    );
  }
}

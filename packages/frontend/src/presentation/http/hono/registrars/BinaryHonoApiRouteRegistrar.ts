import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { BinaryHttpRouteHandler } from "../../routeHandlers/BinaryHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: BinaryHonoApiRouteRegistrar }])
export class BinaryHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(BinaryHttpRouteHandler) private readonly handler: BinaryHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/runs/:runId/binary/:binaryId/content", (c) =>
      this.handler.getRunBinaryContent(c.req.raw, {
        runId: c.req.param("runId"),
        binaryId: c.req.param("binaryId"),
      }),
    );
    app.get("/workflows/:workflowId/debugger-overlay/binary/:binaryId/content", (c) =>
      this.handler.getWorkflowOverlayBinaryContent(c.req.raw, {
        workflowId: c.req.param("workflowId"),
        binaryId: c.req.param("binaryId"),
      }),
    );
  }
}

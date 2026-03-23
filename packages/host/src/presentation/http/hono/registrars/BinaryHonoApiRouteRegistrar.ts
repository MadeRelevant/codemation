import { inject,injectable,registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { BinaryHttpRouteHandler } from "../../routeHandlers/BinaryHttpRouteHandlerFactory";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

/** Run-scoped binary content. Workflow overlay binary GET/POST are registered on {@link CodemationHonoApiApp} after route registrars. */
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
  }
}

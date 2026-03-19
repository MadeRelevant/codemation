import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { RunHttpRouteHandler } from "../../routeHandlers/RunHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: RunHonoApiRouteRegistrar }])
export class RunHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(RunHttpRouteHandler) private readonly handler: RunHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/runs/:runId", (c) => this.handler.getRun(c.req.raw, { runId: c.req.param("runId") }));
    app.post("/runs", (c) => this.handler.postRuns(c.req.raw, {}));
    app.patch("/runs/:runId/workflow-snapshot", (c) =>
      this.handler.patchRunWorkflowSnapshot(c.req.raw, { runId: c.req.param("runId") }),
    );
    app.patch("/runs/:runId/nodes/:nodeId/pin", (c) =>
      this.handler.patchRunNodePin(c.req.raw, {
        runId: c.req.param("runId"),
        nodeId: c.req.param("nodeId"),
      }),
    );
    app.post("/runs/:runId/nodes/:nodeId/run", (c) =>
      this.handler.postRunNode(c.req.raw, {
        runId: c.req.param("runId"),
        nodeId: c.req.param("nodeId"),
      }),
    );
  }
}

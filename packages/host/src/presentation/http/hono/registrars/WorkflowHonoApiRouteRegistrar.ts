import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { WorkflowHttpRouteHandler } from "../../routeHandlers/WorkflowHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: WorkflowHonoApiRouteRegistrar }])
export class WorkflowHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(WorkflowHttpRouteHandler) private readonly handler: WorkflowHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/workflows", (c) => this.handler.getWorkflows(c.req.raw, {}));
    app.get("/workflows/:workflowId/runs", (c) =>
      this.handler.getWorkflowRuns(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
    app.get("/workflows/:workflowId/debugger-overlay", (c) =>
      this.handler.getWorkflowDebuggerOverlay(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
    app.put("/workflows/:workflowId/debugger-overlay", (c) =>
      this.handler.putWorkflowDebuggerOverlay(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
    app.post("/workflows/:workflowId/debugger-overlay/copy-run", (c) =>
      this.handler.postCopyWorkflowDebuggerOverlay(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
    app.get("/workflows/:workflowId", (c) =>
      this.handler.getWorkflow(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
  }
}

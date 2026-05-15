import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import { ApplicationTokens } from "../applicationTokens";
import type { QueryBus } from "../application/bus/QueryBus";
import { GetWorkflowDetailQuery } from "../application/queries/GetWorkflowDetailQuery";
import { WorkflowDefinitionMapper } from "../application/mapping/WorkflowDefinitionMapper";
import { InternalHmacAuthMiddleware } from "../pairing/InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";

/**
 * Registers GET /internal/workflows/:workflowId — HMAC-verified endpoint that returns a
 * single workflow's full DAG (nodes + edges). Used by the concierge agent to inspect a
 * specific workflow. Returns 404 (empty body) when the workflow id doesn't exist.
 */
@injectable()
export class InternalWorkflowDetailRegistrar implements InternalHonoApiRouteRegistrar {
  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(ApplicationTokens.QueryBus) private readonly queryBus: QueryBus,
    @inject(WorkflowDefinitionMapper) private readonly mapper: WorkflowDefinitionMapper,
  ) {}

  register(app: Hono): void {
    app.get("/internal/workflows/:workflowId", this.hmacMiddleware.handle(), async (c) => {
      const workflowId = c.req.param("workflowId");
      const workflow = await this.queryBus.execute(new GetWorkflowDetailQuery(workflowId));
      if (!workflow) {
        return c.body(null, 404);
      }
      return c.json(await this.mapper.map(workflow));
    });
  }
}

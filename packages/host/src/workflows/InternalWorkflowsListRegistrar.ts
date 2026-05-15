import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import { ApplicationTokens } from "../applicationTokens";
import type { QueryBus } from "../application/bus/QueryBus";
import { GetWorkflowSummariesQuery } from "../application/queries/GetWorkflowSummariesQuery";
import { WorkflowDefinitionMapper } from "../application/mapping/WorkflowDefinitionMapper";
import { InternalHmacAuthMiddleware } from "../pairing/InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";

/**
 * Registers GET /internal/workflows — HMAC-verified endpoint that returns the list of
 * workflow summaries. Used by the concierge agent to enumerate available workflows.
 */
@injectable()
export class InternalWorkflowsListRegistrar implements InternalHonoApiRouteRegistrar {
  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(ApplicationTokens.QueryBus) private readonly queryBus: QueryBus,
    @inject(WorkflowDefinitionMapper) private readonly mapper: WorkflowDefinitionMapper,
  ) {}

  register(app: Hono): void {
    app.get("/internal/workflows", this.hmacMiddleware.handle(), async (c) => {
      const workflows = await this.queryBus.execute(new GetWorkflowSummariesQuery());
      return c.json(workflows.map((w) => this.mapper.toSummary(w)));
    });
  }
}

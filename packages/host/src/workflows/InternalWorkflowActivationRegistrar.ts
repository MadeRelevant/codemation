import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import { ApplicationTokens } from "../applicationTokens";
import type { CommandBus } from "../application/bus/CommandBus";
import { SetWorkflowActivationCommand } from "../application/commands/SetWorkflowActivationCommand";
import { InternalHmacAuthMiddleware } from "../pairing/InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";

/**
 * Registers POST /internal/workflows/:workflowId/activation — HMAC-verified endpoint
 * that activates or deactivates a workflow. Used by the coding agent to toggle workflow
 * triggers without requiring a user session.
 */
@injectable()
export class InternalWorkflowActivationRegistrar implements InternalHonoApiRouteRegistrar {
  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(ApplicationTokens.CommandBus) private readonly commandBus: CommandBus,
  ) {}

  register(app: Hono): void {
    app.post("/internal/workflows/:workflowId/activation", this.hmacMiddleware.handle(), async (c) => {
      const workflowId = c.req.param("workflowId");
      let body: { active?: unknown };
      try {
        body = await c.req.json<{ active?: unknown }>();
      } catch {
        return c.json({ error: "Request body must be JSON with boolean active" }, 400);
      }
      if (typeof body.active !== "boolean") {
        return c.json({ error: "Request body must include boolean active" }, 400);
      }
      try {
        const result = await this.commandBus.execute(new SetWorkflowActivationCommand(workflowId, body.active));
        return c.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
      }
    });
  }
}

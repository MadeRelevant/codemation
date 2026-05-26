import { inject, injectable } from "@codemation/core";
import type { JsonValue } from "@codemation/core";
import { Hono } from "hono";
import { DecideHumanTaskCommandHandler } from "../../../../application/hitl/DecideHumanTaskCommandHandler";
import { HttpRequestJsonBodyReader } from "../../HttpRequestJsonBodyReader";
import { ServerHttpErrorResponseFactory } from "../../ServerHttpErrorResponseFactory";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

/**
 * Session-authenticated endpoint: `POST /api/hitl/tasks/:taskId/decide`
 *
 * Used by the CP-side callback and the local /dev/inbox UI (story 06).
 * The session middleware is already applied on the /api sub-app by CodemationHonoApiAppFactory.
 */
@injectable()
export class HitlDecideHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(DecideHumanTaskCommandHandler) private readonly handler: DecideHumanTaskCommandHandler) {}

  register(app: Hono): void {
    app.post("/hitl/tasks/:taskId/decide", async (c) => {
      try {
        const taskId = c.req.param("taskId");
        const body = await HttpRequestJsonBodyReader.readJsonBody<{
          decision: JsonValue;
          decidedBy?: { actorId: string; displayName?: string };
        }>(c.req.raw);
        const result = await this.handler.decide({
          taskId,
          decision: body.decision,
          decidedBy: body.decidedBy ?? { actorId: "session-user" },
        });
        return c.json(result);
      } catch (error) {
        return ServerHttpErrorResponseFactory.fromUnknown(error);
      }
    });
  }
}

import { inject, injectable } from "@codemation/core";
import type { JsonValue } from "@codemation/core";
import { Hono } from "hono";
import { DecideHumanTaskCommandHandler } from "../../../../application/hitl/DecideHumanTaskCommandHandler";
import { HttpRequestJsonBodyReader } from "../../HttpRequestJsonBodyReader";
import { ServerHttpErrorResponseFactory } from "../../ServerHttpErrorResponseFactory";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

/**
 * Token-authenticated (unauthenticated session) endpoint:
 * `POST /api/hitl/tasks/:taskId/resume?token=<signed>`
 *
 * This endpoint is declared as an anonymous route in `HonoHttpAnonymousRoutePolicyRegistry`
 * so the session middleware is bypassed. The HMAC-signed token is the auth mechanism.
 *
 * Used by local inbox and future magic-link channels (Slack, email).
 */
@injectable()
export class HitlResumeHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(DecideHumanTaskCommandHandler) private readonly handler: DecideHumanTaskCommandHandler) {}

  register(app: Hono): void {
    app.post("/hitl/tasks/:taskId/resume", async (c) => {
      try {
        const taskId = c.req.param("taskId");
        const token = c.req.query("token") ?? "";

        // Validate the signed token (replaces session auth for this endpoint)
        await this.handler.validateResumeToken({ taskId, token });

        const body = await HttpRequestJsonBodyReader.readJsonBody<{ decision: JsonValue }>(c.req.raw);
        const result = await this.handler.decide({
          taskId,
          decision: body.decision,
          decidedBy: { actorId: "token-bearer" },
        });
        return c.json(result);
      } catch (error) {
        return ServerHttpErrorResponseFactory.fromUnknown(error);
      }
    });
  }
}

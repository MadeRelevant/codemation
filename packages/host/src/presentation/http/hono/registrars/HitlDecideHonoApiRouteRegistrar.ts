import { inject, injectable } from "@codemation/core";
import type { JsonValue } from "@codemation/core";
import { Hono } from "hono";
import { DecideHumanTaskCommandHandler } from "../../../../application/hitl/DecideHumanTaskCommandHandler";
import { HttpRequestJsonBodyReader } from "../../HttpRequestJsonBodyReader";
import { ServerHttpErrorResponseFactory } from "../../ServerHttpErrorResponseFactory";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";
import { PairingConfigToken } from "../../../../pairing/PairingConfigToken";
import type { PairingConfig } from "../../../../pairing/pairing.types";

/**
 * Session-authenticated endpoint: `POST /api/hitl/tasks/:taskId/decide`
 *
 * Registered ONLY in non-managed mode. Used by the local /dev/inbox UI.
 *
 * In managed mode (`PairingConfig !== null`) the route is intentionally NOT mounted —
 * decisions must arrive via the HMAC-signed `POST /internal/hitl/tasks/:taskId/callback`
 * receiver from the control plane. This prevents a compromised user session
 * from deciding arbitrary pending tasks.
 *
 * The session middleware is already applied on the /api sub-app by CodemationHonoApiAppFactory.
 */
@injectable()
export class HitlDecideHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(
    @inject(DecideHumanTaskCommandHandler) private readonly handler: DecideHumanTaskCommandHandler,
    @inject(PairingConfigToken, { isOptional: true })
    private readonly pairingConfig: PairingConfig | null = null,
  ) {}

  register(app: Hono): void {
    if (this.pairingConfig !== null) {
      // Managed mode — decisions only via HMAC callback. Do not mount the session-auth route.
      return;
    }
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

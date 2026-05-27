import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import { InternalHmacAuthMiddleware } from "../../../../pairing/InternalHmacAuthMiddleware";
import { HitlCallbackHandler } from "../../../../application/hitl/HitlCallbackHandler";
import type { InternalHonoApiRouteRegistrar } from "../InternalHonoApiRouteRegistrar";

/**
 * Registers `POST /internal/hitl/tasks/:taskId/callback` — HMAC-verified endpoint
 * that receives decision callbacks from the control plane and forwards them to
 * `HitlCallbackHandler`.
 *
 * The HMAC middleware verifies the request is signed by the paired CP.
 * `HitlCallbackHandler` additionally asserts the task's workspace matches the
 * pairing config workspace.
 */
@injectable()
export class HitlInternalCallbackHonoApiRouteRegistrar implements InternalHonoApiRouteRegistrar {
  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(HitlCallbackHandler) private readonly callbackHandler: HitlCallbackHandler,
  ) {}

  register(app: Hono): void {
    app.post("/internal/hitl/tasks/:taskId/callback", this.hmacMiddleware.handle(), async (c) => {
      const taskId = c.req.param("taskId");
      const rawBody = c.get("body" as never) as string | undefined;
      const body = rawBody ? JSON.parse(rawBody) : await c.req.json();

      const result = await this.callbackHandler.handle(taskId, body);
      return c.json(result.body, result.status);
    });
  }
}

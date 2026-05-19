import { inject, injectable } from "@codemation/core";
import { Hono } from "hono";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";
import type { SessionVerifier } from "../../../../application/auth/SessionVerifier";
import { ApplicationTokens } from "../../../../applicationTokens";

/**
 * Exposes `GET /api/me` in managed-auth mode.
 *
 * Reads the JWT principal by re-verifying the Bearer token, and returns
 * `{ userId, workspaceId }`. No DB lookup needed — the JWT is the source of truth.
 *
 * Only registered when `auth.kind === "managed"`.
 */
@injectable()
export class ManagedMeHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(
    @inject(ApplicationTokens.SessionVerifier)
    private readonly sessionVerifier: SessionVerifier,
  ) {}

  register(app: Hono): void {
    app.get("/me", async (c) => {
      try {
        const principal = await this.sessionVerifier.verify(c.req.raw);
        if (!principal) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        return c.json({ userId: principal.id, workspaceId: principal.workspaceId ?? null });
      } catch {
        return c.json({ error: "Unauthorized" }, 401);
      }
    });
  }
}

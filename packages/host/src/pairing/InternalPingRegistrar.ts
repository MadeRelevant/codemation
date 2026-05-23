import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import { InternalHmacAuthMiddleware } from "./InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";
import type { PairingConfig } from "./pairing.types";
import { PairingConfigToken } from "./PairingConfigToken";

/**
 * Registers GET /internal/ping — a smoke-test endpoint for verifying workspace pairing.
 * Returns { pong: true, workspaceId } when the HMAC signature validates correctly.
 */
@injectable()
export class InternalPingRegistrar implements InternalHonoApiRouteRegistrar {
  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(PairingConfigToken) private readonly pairingConfig: PairingConfig,
  ) {}

  register(app: Hono): void {
    const { workspaceId } = this.pairingConfig;
    app.get("/internal/ping", this.hmacMiddleware.handle(), (c) => {
      return c.json({ pong: true, workspaceId });
    });
  }
}

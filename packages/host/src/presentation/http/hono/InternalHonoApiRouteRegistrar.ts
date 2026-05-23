import type { Hono } from "hono";

/**
 * Registrar interface for routes mounted on the installation's internal Hono app
 * (no `/api` prefix). All routes registered here are accessible at `/internal/<path>`
 * and are protected by HMAC auth middleware.
 *
 * See docs/pairing-protocol.md for the wire format and auth requirements.
 */
export interface InternalHonoApiRouteRegistrar {
  register(app: Hono): void;
}

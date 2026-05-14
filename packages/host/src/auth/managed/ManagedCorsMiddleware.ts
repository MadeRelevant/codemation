import { injectable } from "@codemation/core";
import type { MiddlewareHandler } from "hono";

/**
 * CORS allowlist middleware for managed mode.
 *
 * Only the single `CP_WEB_ORIGIN` value (provisioner-injected) is permitted.
 * All other origins are refused on preflight with a 403.
 */
@injectable()
export class ManagedCorsMiddleware {
  constructor(private readonly allowedOrigin: string) {}

  handle(): MiddlewareHandler {
    return async (c, next) => {
      const origin = c.req.header("origin");

      // Respond to CORS preflight
      if (c.req.method === "OPTIONS") {
        if (origin === this.allowedOrigin) {
          c.header("access-control-allow-origin", origin);
          c.header("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
          c.header("access-control-allow-headers", "content-type, authorization");
          c.header("access-control-allow-credentials", "true");
          c.header("vary", "Origin");
          return c.body(null, 204);
        }
        return c.body(null, 403);
      }

      // For actual requests, set CORS headers after the handler runs
      if (origin === this.allowedOrigin) {
        await next();
        c.header("access-control-allow-origin", origin);
        c.header("access-control-allow-credentials", "true");
        c.header("vary", "Origin");
        return;
      }

      await next();
    };
  }
}

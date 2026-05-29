import { injectable } from "@codemation/core";
import type { MiddlewareHandler } from "hono";

/**
 * CORS allowlist middleware for managed mode.
 *
 * `CP_WEB_ORIGIN` (provisioner-injected) is a comma-separated allowlist of the
 * browser origins the CP UI may be served from — e.g. the Caddy origin and the
 * direct dev port. The request's own origin is echoed back only when it is a
 * member; all other origins are refused on preflight with a 403.
 */
@injectable()
export class ManagedCorsMiddleware {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(allowedOrigin: string) {
    this.allowedOrigins = new Set(
      allowedOrigin
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    );
  }

  private isAllowed(origin: string | undefined): origin is string {
    return origin !== undefined && this.allowedOrigins.has(origin);
  }

  handle(): MiddlewareHandler {
    return async (c, next) => {
      const origin = c.req.header("origin");

      // Respond to CORS preflight
      if (c.req.method === "OPTIONS") {
        if (this.isAllowed(origin)) {
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
      if (this.isAllowed(origin)) {
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

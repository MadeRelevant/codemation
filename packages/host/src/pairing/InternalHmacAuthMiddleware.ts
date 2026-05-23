import { inject, injectable } from "@codemation/core";
import type { Context, MiddlewareHandler, Next } from "hono";
import { IncomingHmacVerifier } from "./IncomingHmacVerifier";

/**
 * Hono middleware that verifies HMAC-signed requests on /internal/* routes.
 * Rejects with 401 on any auth failure (failure mode is never leaked).
 *
 * Downstream handlers read the consumed body from `c.get("body")` when needed —
 * do NOT call `c.req.text()` again after this middleware runs.
 */
@injectable()
export class InternalHmacAuthMiddleware {
  constructor(@inject(IncomingHmacVerifier) private readonly verifier: IncomingHmacVerifier) {}

  handle(): MiddlewareHandler {
    return async (c: Context, next: Next) => {
      const body = c.req.method === "GET" || c.req.method === "HEAD" ? "" : await c.req.text();

      const result = this.verifier.verify(c.req.method, c.req.url, body, c.req.header("authorization") ?? null);

      if ("failure" in result) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Body stored for downstream handlers that need it (e.g., credential push).
      // Access via c.get("body") — do NOT call c.req.text() again.
      // workspaceId is available from PairingConfig since installation has a single workspace.
      c.set("body" as never, body);
      await next();
    };
  }
}

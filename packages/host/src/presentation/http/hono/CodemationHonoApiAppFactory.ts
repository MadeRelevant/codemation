import { inject, injectAll, injectable } from "@codemation/core";
import { Hono } from "hono";
import type { SessionVerifier } from "../../../application/auth/SessionVerifier";
import { ApplicationTokens } from "../../../applicationTokens";
import { BinaryHttpRouteHandler } from "../routeHandlers/BinaryHttpRouteHandlerFactory";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { HonoApiRouteRegistrar } from "./HonoApiRouteRegistrar";
import { HonoHttpAnonymousRoutePolicy } from "./HonoHttpAnonymousRoutePolicyRegistry";

@injectable()
export class CodemationHonoApiApp {
  private readonly app: Hono;

  constructor(
    @inject(ApplicationTokens.SessionVerifier)
    sessionVerifier: SessionVerifier,
    @injectAll(ApplicationTokens.HonoApiRouteRegistrar)
    registrars: ReadonlyArray<HonoApiRouteRegistrar>,
    @inject(BinaryHttpRouteHandler)
    binaryHttpRouteHandler: BinaryHttpRouteHandler,
  ) {
    const app = new Hono().basePath("/api");
    app.onError((error, _c) => ServerHttpErrorResponseFactory.fromUnknown(error));
    app.use("*", async (c, next) => {
      if (HonoHttpAnonymousRoutePolicy.isAnonymousRoute(c.req.raw)) {
        await next();
        return;
      }
      const principal = await sessionVerifier.verify(c.req.raw);
      if (!principal) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    });
    for (const registrar of registrars) {
      registrar.register(app);
    }
    app.get("/workflows/:workflowId/debugger-overlay/binary/:binaryId/content", (c) =>
      binaryHttpRouteHandler.getWorkflowOverlayBinaryContent(c.req.raw, {
        workflowId: c.req.param("workflowId"),
        binaryId: c.req.param("binaryId"),
      }),
    );
    app.post("/workflows/:workflowId/debugger-overlay/binary/upload", (c) =>
      binaryHttpRouteHandler.postWorkflowDebuggerOverlayBinaryUpload(c.req.raw, {
        workflowId: c.req.param("workflowId"),
      }),
    );
    app.notFound((c) => {
      const method = c.req.method.toUpperCase();
      const url = new URL(c.req.url);
      return c.json({ error: `Unknown API route: ${method} ${url.pathname}` }, 404);
    });
    this.app = app;
  }

  getHono(): Hono {
    return this.app;
  }

  fetch(request: Request): Response | Promise<Response> {
    return this.app.fetch(request);
  }
}

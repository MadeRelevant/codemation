import { inject, injectAll, injectable } from "@codemation/core";
import { Hono } from "hono";
import type { SessionVerifier } from "../../../application/auth/SessionVerifier";
import { ApplicationTokens } from "../../../applicationTokens";
import { BinaryHttpRouteHandler } from "../routeHandlers/BinaryHttpRouteHandlerFactory";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { HonoApiRouteRegistrar } from "./HonoApiRouteRegistrar";
import type { InternalHonoApiRouteRegistrar } from "./InternalHonoApiRouteRegistrar";
import { HonoHttpAnonymousRoutePolicy } from "./HonoHttpAnonymousRoutePolicyRegistry";
import { ManagedCorsMiddleware } from "../../../auth/managed/ManagedCorsMiddleware";

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
    @injectAll(ApplicationTokens.InternalHonoApiRouteRegistrar, { isOptional: true })
    internalRegistrars: ReadonlyArray<InternalHonoApiRouteRegistrar>,
    @injectAll(ApplicationTokens.ManagedCorsMiddleware, { isOptional: true })
    corsMiddlewareList: ReadonlyArray<ManagedCorsMiddleware>,
  ) {
    // Root app — composes /api/* (auth-gated) and /internal/* (HMAC-gated) sub-apps.
    const root = new Hono();
    const corsMiddleware = corsMiddlewareList[0] ?? null;
    if (corsMiddleware) {
      root.use("*", corsMiddleware.handle());
    }

    const api = new Hono().basePath("/api");
    api.onError((error, _c) => ServerHttpErrorResponseFactory.fromUnknown(error));
    api.use("*", async (c, next) => {
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
      registrar.register(api);
    }
    api.get("/workflows/:workflowId/debugger-overlay/binary/:binaryId/content", (c) =>
      binaryHttpRouteHandler.getWorkflowOverlayBinaryContent(c.req.raw, {
        workflowId: c.req.param("workflowId"),
        binaryId: c.req.param("binaryId"),
      }),
    );
    api.post("/workflows/:workflowId/debugger-overlay/binary/upload", (c) =>
      binaryHttpRouteHandler.postWorkflowDebuggerOverlayBinaryUpload(c.req.raw, {
        workflowId: c.req.param("workflowId"),
      }),
    );
    api.notFound((c) => {
      const method = c.req.method.toUpperCase();
      const url = new URL(c.req.url);
      return c.json({ error: `Unknown API route: ${method} ${url.pathname}` }, 404);
    });

    root.route("/", api);

    // /internal/* routes — only mounted when pairing is configured.
    if (internalRegistrars.length > 0) {
      const internal = new Hono();
      for (const registrar of internalRegistrars) {
        registrar.register(internal);
      }
      root.route("/", internal);
    }

    this.app = root;
  }

  getHono(): Hono {
    return this.app;
  }

  fetch(request: Request): Response | Promise<Response> {
    return this.app.fetch(request);
  }
}

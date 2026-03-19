import { injectAll, injectable } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { HonoApiRouteRegistrar } from "./HonoApiRouteRegistrar";

@injectable()
export class CodemationHonoApiApp {
  private readonly app: Hono;

  constructor(
    @injectAll(ApplicationTokens.HonoApiRouteRegistrar)
    registrars: ReadonlyArray<HonoApiRouteRegistrar>,
  ) {
    const app = new Hono().basePath("/api");
    app.onError((error, _c) => ServerHttpErrorResponseFactory.fromUnknown(error));
    app.notFound((c) => {
      const method = c.req.method.toUpperCase();
      const url = new URL(c.req.url);
      return c.json({ error: `Unknown API route: ${method} ${url.pathname}` }, 404);
    });
    for (const registrar of registrars) {
      registrar.register(app);
    }
    this.app = app;
  }

  getHono(): Hono {
    return this.app;
  }

  fetch(request: Request): Response | Promise<Response> {
    return this.app.fetch(request);
  }
}

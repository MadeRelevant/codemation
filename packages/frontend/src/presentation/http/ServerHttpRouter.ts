import { injectAll, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import { ServerHttpRouteDefinition } from "../../infrastructure/server/http/ServerHttpRouteDefinition";
import type { HttpRouteHandler } from "./HttpRouteHandler";
import { serverHttpRouteMetadataKey, type ServerHttpRouteMetadata } from "./Route";

@injectable()
export class ServerHttpRouter {
  private readonly routes: ReadonlyArray<ServerHttpRouteDefinition>;

  constructor(
    @injectAll(ApplicationTokens.HttpRouteHandler)
    routeHandlers: ReadonlyArray<HttpRouteHandler>,
  ) {
    this.routes = this.createRoutes(routeHandlers);
  }

  async dispatch(request: Request, splat: string | undefined): Promise<Response> {
    const pathSegments = this.toSegments(splat);
    const method = request.method.toUpperCase();
    for (const route of this.routes) {
      const params = route.match(method, pathSegments);
      if (!params) {
        continue;
      }
      return await route.handle(request, params);
    }
    return Response.json(
      {
        error: `Unknown API route: ${method} /api/${pathSegments.join("/")}`,
      },
      { status: 404 },
    );
  }

  private toSegments(splat: string | undefined): ReadonlyArray<string> {
    if (!splat) {
      return [];
    }
    return splat.split("/").filter(Boolean);
  }

  private createRoutes(routeHandlers: ReadonlyArray<HttpRouteHandler>): ReadonlyArray<ServerHttpRouteDefinition> {
    const routes: Array<ServerHttpRouteDefinition> = [];
    for (const routeHandler of routeHandlers) {
      routes.push(...this.createRoutesForHandler(routeHandler));
    }
    return routes;
  }

  private createRoutesForHandler(routeHandler: HttpRouteHandler): ReadonlyArray<ServerHttpRouteDefinition> {
    const routeMetadata =
      (Reflect.getMetadata(serverHttpRouteMetadataKey, (routeHandler as Readonly<{ constructor: object }>).constructor) as
        | ReadonlyArray<ServerHttpRouteMetadata>
        | undefined) ?? [];
    return routeMetadata.map((route) => {
      const method = (routeHandler as Record<string, unknown>)[route.propertyKey];
      if (typeof method !== "function") {
        throw new Error(`Route handler ${routeHandler.constructor.name} is missing method ${route.propertyKey}.`);
      }
      return new ServerHttpRouteDefinition(route.method, route.path, method.bind(routeHandler));
    });
  }
}

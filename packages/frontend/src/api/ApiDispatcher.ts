import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import {
  CodemationRealtimeRouteHandlers,
  getRunRoute,
  getWorkflowRoute,
  getWorkflowRunsRoute,
  getWorkflowsRoute,
  postRunRoute,
  postWebhookRoute,
} from "../routeExports";

type RouteContext<TParams extends Record<string, string>> = Readonly<{
  params: Promise<TParams>;
}>;

export class ApiDispatcher {
  constructor(private readonly configOverride: CodemationBootstrapResult) {}

  async dispatch(request: Request, splat: string | undefined): Promise<Response> {
    const segments = this.toSegments(splat);
    const method = request.method.toUpperCase();

    if (method === "GET" && segments.length === 1 && segments[0] === "workflows") {
      return await getWorkflowsRoute({ configOverride: this.configOverride });
    }

    if (method === "GET" && segments.length === 2 && segments[0] === "workflows") {
      return await getWorkflowRoute(request, this.createContext({ workflowId: segments[1]! }), { configOverride: this.configOverride });
    }

    if (method === "GET" && segments.length === 3 && segments[0] === "workflows" && segments[2] === "runs") {
      return await getWorkflowRunsRoute(request, this.createContext({ workflowId: segments[1]! }), { configOverride: this.configOverride });
    }

    if (method === "POST" && segments.length === 1 && segments[0] === "run") {
      return await postRunRoute(request, { configOverride: this.configOverride });
    }

    if (method === "POST" && segments.length === 2 && segments[0] === "realtime" && segments[1] === "ready") {
      return await CodemationRealtimeRouteHandlers.postReady({ configOverride: this.configOverride });
    }

    if (method === "GET" && segments.length === 2 && segments[0] === "runs") {
      return await getRunRoute(request, this.createContext({ runId: segments[1]! }), { configOverride: this.configOverride });
    }

    if (segments.length === 2 && segments[0] === "webhooks") {
      return await postWebhookRoute(request, this.createContext({ endpointId: segments[1]! }), { configOverride: this.configOverride });
    }

    return Response.json(
      {
        error: `Unknown API route: ${method} /api/${segments.join("/")}`,
      },
      { status: 404 },
    );
  }

  private createContext<TParams extends Record<string, string>>(params: TParams): RouteContext<TParams> {
    return { params: Promise.resolve(params) };
  }

  private toSegments(splat: string | undefined): ReadonlyArray<string> {
    if (!splat) return [];
    return splat.split("/").filter(Boolean);
  }
}

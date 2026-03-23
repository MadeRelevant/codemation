import type { Hono } from "hono";

import { DevelopmentRuntimeRouteGuard } from "@codemation/host/dev-server-sidecar";

import type { CodemationNextHost } from "./CodemationNextHost";

export class DevelopmentRuntimeApi {
  static attach(api: Hono, host: CodemationNextHost): void {
    api.post("/dev/runtime", async (c) => await this.handlePost(c.req.raw, host));
  }

  static async handlePost(request: Request, host: CodemationNextHost): Promise<Response> {
    if (!DevelopmentRuntimeRouteGuard.isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const signal = await DevelopmentRuntimeRouteGuard.parseSignal(request);
    if (signal.kind === "buildStarted") {
      await host.notifyBuildStarted({
        buildVersion: signal.buildVersion,
      });
      return new Response(null, { status: 204 });
    }
    if (signal.kind === "buildCompleted") {
      await host.notifyBuildCompleted({
        buildVersion: signal.buildVersion,
      });
      return new Response(null, { status: 204 });
    }
    await host.notifyBuildFailed({
      message: signal.message,
    });
    return new Response(null, { status: 204 });
  }
}

export { DevelopmentRuntimeRouteGuard,type DevelopmentRuntimeSignal } from "@codemation/host/dev-server-sidecar";

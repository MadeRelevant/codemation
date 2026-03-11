import { injectable } from "@codemation/core";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { FrontendRuntimeProvider } from "./frontendRouteTokens";

@injectable()
export class RealtimeRouteHandler {
  constructor(private readonly frontendRuntimeProvider: FrontendRuntimeProvider) {}

  async postReady(args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<Response> {
    const runtime = await this.frontendRuntimeProvider.getRuntime(args);
    console.info(`[codemation-routes.server] realtime ready websocketPort=${runtime.getWebsocketPort()}`);
    return Response.json({ ok: true, websocketPort: runtime.getWebsocketPort() });
  }
}

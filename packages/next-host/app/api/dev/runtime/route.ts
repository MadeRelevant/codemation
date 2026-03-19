import { CodemationNextHost } from "../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DevelopmentRuntimeSignal =
  | Readonly<{ kind: "buildStarted"; buildVersion?: string }>
  | Readonly<{ kind: "buildCompleted"; buildVersion?: string }>
  | Readonly<{ kind: "buildFailed"; message: string }>;

class DevelopmentRuntimeRouteGuard {
  static isAuthorized(request: Request): boolean {
    if (this.isLoopbackRequest(request)) {
      return true;
    }
    const expectedToken = process.env.CODEMATION_DEV_SERVER_TOKEN;
    if (!expectedToken) {
      return true;
    }
    return request.headers.get("x-codemation-dev-token") === expectedToken;
  }

  private static isLoopbackRequest(request: Request): boolean {
    const requestUrl = new URL(request.url);
    return requestUrl.hostname === "127.0.0.1" || requestUrl.hostname === "localhost" || requestUrl.hostname === "::1";
  }

  static async parseSignal(request: Request): Promise<DevelopmentRuntimeSignal> {
    const payload = (await request.json()) as Readonly<{
      kind?: unknown;
      buildVersion?: unknown;
      message?: unknown;
    }>;
    if (payload.kind === "buildStarted") {
      return {
        kind: payload.kind,
        buildVersion: typeof payload.buildVersion === "string" ? payload.buildVersion : undefined,
      };
    }
    if (payload.kind === "buildCompleted") {
      return {
        kind: payload.kind,
        buildVersion: typeof payload.buildVersion === "string" ? payload.buildVersion : undefined,
      };
    }
    if (payload.kind === "buildFailed" && typeof payload.message === "string" && payload.message.length > 0) {
      return {
        kind: payload.kind,
        message: payload.message,
      };
    }
    throw new Error("Unsupported development runtime signal.");
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!DevelopmentRuntimeRouteGuard.isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const signal = await DevelopmentRuntimeRouteGuard.parseSignal(request);
  if (signal.kind === "buildStarted") {
    await CodemationNextHost.shared.notifyBuildStarted({
      buildVersion: signal.buildVersion,
    });
    return new Response(null, { status: 204 });
  }
  if (signal.kind === "buildCompleted") {
    await CodemationNextHost.shared.notifyBuildCompleted({
      buildVersion: signal.buildVersion,
    });
    return new Response(null, { status: 204 });
  }
  await CodemationNextHost.shared.notifyBuildFailed({
    message: signal.message,
  });
  return new Response(null, { status: 204 });
}

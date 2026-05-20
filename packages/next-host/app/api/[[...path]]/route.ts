export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveRuntimeDevProxyPath(pathname: string): string {
  return pathname;
}

async function handle(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.pathname === "/api/dev/runtime") {
    return new Response(null, { status: 204 });
  }
  // Guard: the specific /api/lucide-icon/[name] route handler should handle
  // these requests. In some Next.js routing edge cases the catch-all can shadow
  // the more-specific route. Intercept here to ensure correct behaviour.
  if (request.method === "GET" && incoming.pathname.startsWith("/api/lucide-icon/")) {
    const rawName = incoming.pathname.slice("/api/lucide-icon/".length);
    const { lucideIconGet } = await import("../lucide-icon/lucideIconGet");
    return lucideIconGet(rawName);
  }
  const runtimeDevUrl = process.env.CODEMATION_RUNTIME_DEV_URL;
  if (runtimeDevUrl !== undefined && runtimeDevUrl.trim().length > 0) {
    const base = runtimeDevUrl.replace(/\/$/, "");
    const proxyUrl = `${base}${resolveRuntimeDevProxyPath(incoming.pathname)}${incoming.search}`;
    const headers = new Headers(request.headers);
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half";
    }
    return fetch(proxyUrl, init);
  }
  const { CodemationNextHost } = await import("../../../src/server/CodemationNextHost");
  return CodemationNextHost.shared.fetchApi(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

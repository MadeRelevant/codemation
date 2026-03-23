export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const runtimeDevUrl = process.env.CODEMATION_RUNTIME_DEV_URL;
  if (runtimeDevUrl !== undefined && runtimeDevUrl.trim().length > 0) {
    const base = runtimeDevUrl.replace(/\/$/, "");
    const incoming = new URL(request.url);
    const proxyUrl = `${base}${incoming.pathname}${incoming.search}`;
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

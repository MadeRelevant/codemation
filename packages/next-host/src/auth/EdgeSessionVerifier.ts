import type { NextRequest } from "next/server";

export class EdgeSessionVerifier {
  static async hasAuthenticatedSession(request: NextRequest, _secret: string | null): Promise<boolean> {
    // Resolve the auth-session endpoint via the X-Forwarded-Host header (set by the dev gateway
    // through `xfwd: true`) or — failing that — the explicit CODEMATION_RUNTIME_DEV_URL /
    // BETTER_AUTH_URL env. We must NOT fall back to `request.nextUrl.origin`, which on a
    // proxied dev request resolves to Next's own loopback (e.g. http://127.0.0.1:3001) and
    // makes this fetch loop back into Next — which then has to compile its `/api/[[...path]]`
    // catch-all (transitively `@codemation/host` + Prisma + DI + plugin metadata, ~5 GB Turbopack
    // peak) to serve the request, OOM-killing next-server on 8-GB WSL boxes. The dev gateway
    // intercepts /api/* and routes it to the disposable runtime, so going through the gateway
    // bypasses the heavy Next API route entirely.
    const sessionOrigin = EdgeSessionVerifier.resolveSessionOrigin(request);
    const sessionUrl = new URL("/api/auth/session", sessionOrigin);
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("cookie", cookie);
    }
    headers.set("origin", sessionOrigin);
    try {
      const response = await fetch(sessionUrl, {
        headers,
        cache: "no-store",
      });
      if (!response.ok) {
        return false;
      }
      return (await response.json()) !== null;
    } catch {
      return false;
    }
  }

  private static resolveSessionOrigin(request: NextRequest): string {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost && forwardedHost.length > 0) {
      const proto = forwardedProto && forwardedProto.length > 0 ? forwardedProto : "http";
      return `${proto}://${forwardedHost}`;
    }
    const runtimeDevUrl = process.env.CODEMATION_RUNTIME_DEV_URL?.trim();
    if (runtimeDevUrl && runtimeDevUrl.length > 0) {
      return runtimeDevUrl.replace(/\/$/, "");
    }
    const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim();
    if (betterAuthUrl && betterAuthUrl.length > 0) {
      return betterAuthUrl.replace(/\/$/, "");
    }
    return request.nextUrl.origin;
  }
}

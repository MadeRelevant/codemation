import type { NextRequest } from "next/server";

export class EdgeSessionVerifier {
  static async hasAuthenticatedSession(request: NextRequest, _secret: string | null): Promise<boolean> {
    const sessionUrl = new URL("/api/auth/session", request.nextUrl.origin);
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("cookie", cookie);
    }
    headers.set("origin", request.nextUrl.origin);
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
}

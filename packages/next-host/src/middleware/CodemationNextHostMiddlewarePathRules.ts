/** Path classification for Next.js middleware (Edge). Extracted for unit tests. */
export class CodemationNextHostMiddlewarePathRules {
  static isFrameworkAuthRoute(pathname: string): boolean {
    return pathname.startsWith("/api/auth");
  }

  static isAnonymousApiRoute(pathname: string): boolean {
    return (
      pathname.startsWith("/api/webhooks") ||
      pathname === "/api/dev/runtime" ||
      pathname === "/api/dev/bootstrap-summary" ||
      pathname === "/api/users/invites/verify" ||
      pathname === "/api/users/invites/accept" ||
      // Anonymous whitelabel logo (login page `<img>`; same path as ApiPaths.whitelabelLogo() / Hono anonymous policy).
      pathname === "/api/whitelabel/logo"
    );
  }

  static isPublicUiRoute(pathname: string): boolean {
    return pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/invite/");
  }

  static isNextStaticAsset(pathname: string): boolean {
    return (
      pathname.startsWith("/_next") ||
      pathname === "/favicon.ico" ||
      pathname.startsWith("/favicon.ico") ||
      pathname.startsWith("/public")
    );
  }
}

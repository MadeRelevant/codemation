import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./src/auth/codemationEdgeAuth";

class CodemationNextHostPathRules {
  static isFrameworkAuthRoute(pathname: string): boolean {
    return pathname.startsWith("/api/auth");
  }

  static isAnonymousApiRoute(pathname: string): boolean {
    return (
      pathname.startsWith("/api/webhooks") ||
      pathname === "/api/dev/runtime" ||
      pathname === "/api/users/invites/verify" ||
      pathname === "/api/users/invites/accept"
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

export default auth((request: NextRequest) => {
  if (process.env.CODEMATION_SKIP_UI_AUTH === "true") {
    return NextResponse.next();
  }
  const pathname = request.nextUrl.pathname;
  if (
    CodemationNextHostPathRules.isFrameworkAuthRoute(pathname) ||
    CodemationNextHostPathRules.isAnonymousApiRoute(pathname) ||
    CodemationNextHostPathRules.isPublicUiRoute(pathname) ||
    CodemationNextHostPathRules.isNextStaticAsset(pathname)
  ) {
    return NextResponse.next();
  }
  if (!request.auth) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|svg|webp)$).*)"],
};

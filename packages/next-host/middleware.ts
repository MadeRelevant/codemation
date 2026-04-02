import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "./src/auth/edgeAuth";
import { EdgeAuthConfigurationReader } from "./src/auth/EdgeAuthConfigurationReader";
import { CodemationNextHostMiddlewarePathRules } from "./src/middleware/CodemationNextHostMiddlewarePathRules";

const edgeAuthConfiguration = new EdgeAuthConfigurationReader().readFromEnvironment();

export default auth((request: NextRequest) => {
  if (edgeAuthConfiguration.uiAuthEnabled === false) {
    return NextResponse.next();
  }
  const pathname = request.nextUrl.pathname;
  if (
    CodemationNextHostMiddlewarePathRules.isFrameworkAuthRoute(pathname) ||
    CodemationNextHostMiddlewarePathRules.isAnonymousApiRoute(pathname) ||
    CodemationNextHostMiddlewarePathRules.isPublicUiRoute(pathname) ||
    CodemationNextHostMiddlewarePathRules.isNextStaticAsset(pathname)
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

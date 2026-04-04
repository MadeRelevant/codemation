import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EdgeAuthConfigurationReader } from "./src/auth/EdgeAuthConfigurationReader";
import { EdgeSessionVerifier } from "./src/auth/EdgeSessionVerifier";
import { CodemationNextHostMiddlewarePathRules } from "./src/middleware/CodemationNextHostMiddlewarePathRules";

const edgeAuthConfiguration = new EdgeAuthConfigurationReader().readFromEnvironment();

export default async function middleware(request: NextRequest) {
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
  const hasAuthenticatedSession = await EdgeSessionVerifier.hasAuthenticatedSession(
    request,
    edgeAuthConfiguration.authSecret,
  );
  if (!hasAuthenticatedSession) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|svg|webp)$).*)"],
};

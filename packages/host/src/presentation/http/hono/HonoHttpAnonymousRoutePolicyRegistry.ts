import { ApiPaths } from "../ApiPaths";

/**
 * Routes that must remain callable without an authenticated Codemation session.
 * @see ApiPaths — keep in sync with webhook + dev-only endpoints.
 */
export class HonoHttpAnonymousRoutePolicy {
  private static readonly webhookPrefix = `${ApiPaths.webhooks()}/`;

  private static apiAuthRoot(): string {
    return ApiPaths.authSession().replace(/\/session$/, "");
  }

  static isAnonymousRoute(request: Request): boolean {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === ApiPaths.webhooks() || pathname.startsWith(this.webhookPrefix)) {
      return true;
    }
    if (pathname === "/api/dev/runtime" || pathname === "/api/dev/bootstrap-summary") {
      return true;
    }
    if (pathname === ApiPaths.frontendBootstrap() || pathname === ApiPaths.internalAuthBootstrap()) {
      return true;
    }
    {
      const authRoot = this.apiAuthRoot();
      if (pathname === authRoot || pathname.startsWith(`${authRoot}/`)) {
        return true;
      }
    }
    if (pathname === ApiPaths.userInviteVerify() || pathname === ApiPaths.userInviteAccept()) {
      return true;
    }
    if (pathname === ApiPaths.whitelabelLogo()) {
      return true;
    }
    return false;
  }
}

import { ApiPaths } from "../ApiPaths";

/**
 * Routes that must remain callable without an authenticated Codemation session.
 * @see ApiPaths — keep in sync with webhook + dev-only endpoints.
 */
export class HonoHttpAnonymousRoutePolicy {
  private static readonly webhookPrefix = `${ApiPaths.webhooks()}/`;

  static isAnonymousRoute(request: Request): boolean {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === ApiPaths.webhooks() || pathname.startsWith(this.webhookPrefix)) {
      return true;
    }
    if (pathname === "/api/dev/runtime") {
      return true;
    }
    if (pathname === ApiPaths.userInviteVerify() || pathname === ApiPaths.userInviteAccept()) {
      return true;
    }
    return false;
  }
}

import { createAuthClient } from "better-auth/client";

/**
 * Composition root for the Better Auth browser client. The client owns fetch metadata,
 * credentials, and path routing against the host-mounted `/api/auth` surface.
 */
export class CodemationBetterAuthBrowserClientFactory {
  create(): ReturnType<typeof createAuthClient> {
    return createAuthClient({
      disableDefaultFetchPlugins: true,
    });
  }
}

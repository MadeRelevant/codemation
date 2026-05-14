import type { VerifiedManagedPrincipal } from "@codemation/managed-auth";

/**
 * Authenticates an incoming WebSocket upgrade request.
 *
 * Implementations parse the upgrade URL (e.g. `?token=<jwt>`) and verify the
 * credential.  Returns the verified principal on success, or `null` when the
 * request must be rejected with close-code 4401.
 */
export interface WebsocketAuthenticator {
  authenticate(requestUrl: string | undefined): Promise<VerifiedManagedPrincipal | null>;
}

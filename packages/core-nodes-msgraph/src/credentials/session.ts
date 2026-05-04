import { Client } from "@microsoft/microsoft-graph-client";

/**
 * Typed credential session produced by {@link msGraphOAuthCredentialType.createSession}.
 * Callers use `session.refresh()` to get a current access token; the underlying MSAL
 * client handles caching and re-issuance transparently.
 */
export type MsGraphSession = Readonly<{
  /** The most recently obtained access token — may already be cached by MSAL. */
  accessToken: string;
  /** Returns a valid (non-expired) access token, refreshing via MSAL if needed. */
  refresh(): Promise<string>;
}>;

/**
 * Build a Microsoft Graph SDK `Client` that automatically refreshes tokens via the session.
 * The SDK calls `getAccessToken()` before every request, so token refresh is transparent.
 */
export function createGraphClient(session: MsGraphSession): Client {
  return Client.initWithMiddleware({
    authProvider: {
      // getAccessToken is the interface required by AuthenticationProvider.
      async getAccessToken(): Promise<string> {
        return session.refresh();
      },
    },
  });
}

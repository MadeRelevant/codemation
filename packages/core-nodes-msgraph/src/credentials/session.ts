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

/**
 * Shared MSAL-backed session factory for both msgraph-mail-oauth and msgraph-drive-oauth
 * credential types — the only difference between them is the scope preset map at the
 * credential-type definition layer; the runtime token-refresh logic is identical.
 */
export async function createMsGraphOAuthSession(args: {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  scopes: ReadonlyArray<string>;
  refreshToken: string;
}): Promise<MsGraphSession> {
  const { ConfidentialClientApplication } = await import("@azure/msal-node");

  const msal = new ConfidentialClientApplication({
    auth: {
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      authority: `https://login.microsoftonline.com/${args.tenantId}`,
    },
  });

  const mutableScopes = [...args.scopes];
  let cachedAccessToken = "";
  let tokenExpiresAt = 0;

  async function refresh(): Promise<string> {
    if (cachedAccessToken && Date.now() < tokenExpiresAt - 30_000) {
      return cachedAccessToken;
    }
    const result = await msal.acquireTokenByRefreshToken({
      refreshToken: args.refreshToken,
      scopes: mutableScopes,
    });
    if (!result?.accessToken) {
      throw new Error("Microsoft Graph: token refresh returned no access token");
    }
    cachedAccessToken = result.accessToken;
    tokenExpiresAt = result.expiresOn?.getTime() ?? Date.now() + 3600_000;
    return cachedAccessToken;
  }

  // Eagerly fetch a token so callers get an early error if credentials are wrong.
  if (args.refreshToken) {
    cachedAccessToken = await refresh();
  }

  return { accessToken: cachedAccessToken, refresh };
}

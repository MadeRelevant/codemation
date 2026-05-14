import { injectable } from "@codemation/core";
import type { ManagedJwtVerifier, VerifiedManagedPrincipal } from "@codemation/managed-auth";
import type { WebsocketAuthenticator } from "./WebsocketAuthenticator.types";

/**
 * WebSocket authenticator for `auth.kind: "managed"`.
 *
 * Parses `?token=<jwt>` from the WS upgrade URL and delegates to
 * `ManagedJwtVerifier`.  Returns the verified principal on success or `null`
 * when the token is missing, expired, has the wrong audience, or is otherwise
 * invalid.
 *
 * Note: browsers cannot set `Authorization` headers on `new WebSocket(url)`,
 * so the bearer is carried as a query-string parameter.
 */
@injectable()
export class ManagedWebsocketAuthenticator implements WebsocketAuthenticator {
  constructor(private readonly verifier: ManagedJwtVerifier) {}

  async authenticate(requestUrl: string | undefined): Promise<VerifiedManagedPrincipal | null> {
    if (!requestUrl) {
      return null;
    }

    const token = this.extractToken(requestUrl);
    if (!token) {
      return null;
    }

    const result = await this.verifier.verify(token);
    if ("failure" in result) {
      return null;
    }

    return result;
  }

  private extractToken(requestUrl: string): string | null {
    // requestUrl is a relative path like "/__codemation/internal/ws?token=..."
    // Use a dummy base so URL can parse relative URLs.
    let url: URL;
    try {
      url = new URL(requestUrl, "http://placeholder");
    } catch {
      return null;
    }
    const token = url.searchParams.get("token");
    return token && token.length > 0 ? token : null;
  }
}

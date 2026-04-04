/** Browser-side CSRF cookie names mirror the host AuthSessionCookieFactory. */
export class CodemationBrowserCsrfCoordinator {
  private static readonly insecureCsrfCookieName = "codemation.csrf-token";
  private static readonly secureCsrfCookieName = "__Host-codemation.csrf-token";

  constructor(private readonly authSessionUrl: string) {}

  readTokenFromDocumentCookie(): string | null {
    const cookies = document.cookie.split(";");
    for (const rawCookie of cookies) {
      const separatorIndex = rawCookie.indexOf("=");
      if (separatorIndex < 0) {
        continue;
      }
      const key = rawCookie.slice(0, separatorIndex).trim();
      if (
        key !== CodemationBrowserCsrfCoordinator.insecureCsrfCookieName &&
        key !== CodemationBrowserCsrfCoordinator.secureCsrfCookieName
      ) {
        continue;
      }
      return decodeURIComponent(rawCookie.slice(separatorIndex + 1).trim());
    }
    return null;
  }

  async ensureToken(fetchImpl: typeof fetch): Promise<string | null> {
    const existing = this.readTokenFromDocumentCookie();
    if (existing) {
      return existing;
    }
    await fetchImpl(this.authSessionUrl, {
      cache: "no-store",
      credentials: "include",
    });
    return this.readTokenFromDocumentCookie();
  }
}

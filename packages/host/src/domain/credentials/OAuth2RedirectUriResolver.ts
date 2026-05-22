import { inject, injectable } from "@codemation/core";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";

/**
 * Resolves the canonical OAuth2 redirect URI from the public base URL or request origin.
 * The redirect URI always points to `/api/oauth2/callback`, which is the URL operators
 * register with their OAuth provider.
 */
@injectable()
export class OAuth2RedirectUriResolver {
  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
  ) {}

  resolve(requestOrigin: string): string {
    const rawBase = this.appConfig.env.CODEMATION_PUBLIC_BASE_URL?.trim() || requestOrigin.trim();
    if (!rawBase) {
      throw new Error("Unable to resolve the public base URL for OAuth2 redirect URI generation.");
    }
    const baseUrl = this.ensureAbsoluteUrl(rawBase);
    try {
      const callback = new URL("/api/oauth2/callback", this.normalizeBaseUrl(baseUrl));
      // Several OAuth2 providers (notably Azure AD / Microsoft) reject raw loopback IPs in
      // redirect URIs and only allow the `localhost` hostname. 127.0.0.1 / [::1] are equivalent
      // to localhost by definition, so rewriting is lossless.
      const loopbackHostnames = new Set(["127.0.0.1", "[::1]"]);
      if (loopbackHostnames.has(callback.hostname)) {
        callback.hostname = "localhost";
      }
      return callback.toString();
    } catch {
      throw new ApplicationRequestError(
        500,
        `Invalid public base URL for OAuth2 redirect URI generation: "${rawBase}". Use a full URL (e.g. http://localhost:3000) for CODEMATION_PUBLIC_BASE_URL or ensure the request has a valid Host / forwarded headers.`,
      );
    }
  }

  /**
   * Ensures the base URL has an http/https scheme. Comma-separated values (proxy chains) use
   * the first segment only.
   */
  private ensureAbsoluteUrl(raw: string): string {
    const segments = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    let candidate = segments[0] ?? raw.trim();
    if (!candidate) {
      throw new Error("Unable to resolve the public base URL for OAuth2 redirect URI generation.");
    }
    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `http://${candidate}`;
    }
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new ApplicationRequestError(
        500,
        `Invalid public base URL for OAuth2 redirect URI generation: "${raw}". Use a single full URL (e.g. http://localhost:3000) for CODEMATION_PUBLIC_BASE_URL.`,
      );
    }
    if (parsed.hostname === "http" || parsed.hostname === "https") {
      throw new ApplicationRequestError(
        500,
        `Invalid OAuth2 public base URL (hostname "${parsed.hostname}"). Set CODEMATION_PUBLIC_BASE_URL to one full URL with a real host, e.g. http://localhost:3000 — not "http,http" or other typos.`,
      );
    }
    return candidate;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }
}

import { inject, injectable } from "@codemation/core";
import { encode } from "@auth/core/jwt";
import { randomBytes } from "node:crypto";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";

@injectable()
export class AuthSessionCookieFactory {
  private static readonly sessionCookieMaxAgeSeconds = 60 * 60 * 24 * 30;
  private static readonly csrfCookieMaxAgeSeconds = 60 * 60 * 12;
  private static readonly sessionCookieSalt = "authjs.session-token";
  private static readonly insecureSessionCookieName = "authjs.session-token";
  private static readonly secureSessionCookieName = "__Secure-authjs.session-token";
  private static readonly insecureCsrfCookieName = "codemation.csrf-token";
  private static readonly secureCsrfCookieName = "__Host-codemation.csrf-token";

  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
  ) {}

  async createSessionCookie(request: Request, principal: AuthenticatedPrincipal): Promise<string> {
    const token = await encode({
      secret: this.requireAuthSecret(),
      salt: AuthSessionCookieFactory.sessionCookieSalt,
      maxAge: AuthSessionCookieFactory.sessionCookieMaxAgeSeconds,
      token: {
        sub: principal.id,
        email: principal.email ?? undefined,
        name: principal.name ?? undefined,
      },
    });
    return this.createCookieHeader({
      httpOnly: true,
      maxAgeSeconds: AuthSessionCookieFactory.sessionCookieMaxAgeSeconds,
      name: this.resolveSessionCookieName(this.isSecureRequest(request)),
      request,
      value: token,
    });
  }

  clearSessionCookie(request: Request): string {
    return this.createCookieHeader({
      httpOnly: true,
      maxAgeSeconds: 0,
      name: this.resolveSessionCookieName(this.isSecureRequest(request)),
      request,
      value: "",
    });
  }

  ensureCsrfCookie(request: Request): Readonly<{ cookieHeader: string | null; csrfToken: string }> {
    const secure = this.isSecureRequest(request);
    const cookieName = this.resolveCsrfCookieName(secure);
    const cookies = this.readCookies(request);
    const existing = cookies.get(cookieName);
    if (existing) {
      return {
        cookieHeader: null,
        csrfToken: existing,
      };
    }
    const csrfToken = randomBytes(24).toString("base64url");
    return {
      cookieHeader: this.createCookieHeader({
        httpOnly: false,
        maxAgeSeconds: AuthSessionCookieFactory.csrfCookieMaxAgeSeconds,
        name: cookieName,
        request,
        value: csrfToken,
      }),
      csrfToken,
    };
  }

  assertCsrf(request: Request): void {
    const secure = this.isSecureRequest(request);
    const cookieName = this.resolveCsrfCookieName(secure);
    const headerToken = request.headers.get("x-codemation-csrf-token")?.trim();
    const cookieToken = this.readCookies(request).get(cookieName)?.trim();
    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      throw new ApplicationRequestError(403, "Invalid CSRF token.");
    }
  }

  private createCookieHeader(
    args: Readonly<{
      name: string;
      value: string;
      request: Request;
      maxAgeSeconds: number;
      httpOnly: boolean;
    }>,
  ): string {
    const segments = [
      `${args.name}=${encodeURIComponent(args.value)}`,
      "Path=/",
      `Max-Age=${String(args.maxAgeSeconds)}`,
      "SameSite=Lax",
    ];
    if (args.httpOnly) {
      segments.push("HttpOnly");
    }
    if (this.isSecureRequest(args.request)) {
      segments.push("Secure");
    }
    return segments.join("; ");
  }

  private readCookies(request: Request): Map<string, string> {
    const cookies = new Map<string, string>();
    const raw = request.headers.get("cookie");
    if (!raw) {
      return cookies;
    }
    for (const entry of raw.split(";")) {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex < 0) {
        continue;
      }
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      cookies.set(key, decodeURIComponent(value));
    }
    return cookies;
  }

  private resolveSessionCookieName(secure: boolean): string {
    return secure
      ? AuthSessionCookieFactory.secureSessionCookieName
      : AuthSessionCookieFactory.insecureSessionCookieName;
  }

  private resolveCsrfCookieName(secure: boolean): string {
    return secure ? AuthSessionCookieFactory.secureCsrfCookieName : AuthSessionCookieFactory.insecureCsrfCookieName;
  }

  private isSecureRequest(request: Request): boolean {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwardedProto === "https") {
      return true;
    }
    return new URL(request.url).protocol === "https:";
  }

  private requireAuthSecret(): string {
    const secret =
      this.appConfig.env.AUTH_SECRET?.trim() ||
      (this.appConfig.env.NODE_ENV !== "production" ? "codemation-dev-auth-secret-not-for-production" : "");
    if (!secret) {
      throw new Error("AUTH_SECRET is required for Codemation authentication.");
    }
    return secret;
  }
}

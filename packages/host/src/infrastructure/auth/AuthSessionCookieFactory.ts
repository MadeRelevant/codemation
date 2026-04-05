import { inject, injectable } from "@codemation/core";
import { encode } from "@auth/core/jwt";
import { parse, serialize } from "hono/utils/cookie";
import { randomBytes } from "node:crypto";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";
import { SecureRequestDetector } from "./SecureRequestDetector";

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
    @inject(SecureRequestDetector)
    private readonly secureRequestDetector: SecureRequestDetector,
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
    return this.buildSetCookieHeader({
      httpOnly: true,
      maxAgeSeconds: AuthSessionCookieFactory.sessionCookieMaxAgeSeconds,
      name: this.resolveSessionCookieName(this.secureRequestDetector.isSecureRequest(request)),
      request,
      value: token,
    });
  }

  clearSessionCookie(request: Request): string {
    return this.buildSetCookieHeader({
      httpOnly: true,
      maxAgeSeconds: 0,
      name: this.resolveSessionCookieName(this.secureRequestDetector.isSecureRequest(request)),
      request,
      value: "",
    });
  }

  ensureCsrfCookie(request: Request): Readonly<{ cookieHeader: string | null; csrfToken: string }> {
    const secure = this.secureRequestDetector.isSecureRequest(request);
    const cookieName = this.resolveCsrfCookieName(secure);
    const jar = this.parseCookieHeader(request);
    const existing = jar[cookieName];
    if (existing) {
      return {
        cookieHeader: null,
        csrfToken: existing,
      };
    }
    const csrfToken = randomBytes(24).toString("base64url");
    return {
      cookieHeader: this.buildSetCookieHeader({
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
    const secure = this.secureRequestDetector.isSecureRequest(request);
    const cookieName = this.resolveCsrfCookieName(secure);
    const headerToken = request.headers.get("x-codemation-csrf-token")?.trim();
    const jar = this.parseCookieHeader(request);
    const cookieToken = jar[cookieName]?.trim();
    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      throw new ApplicationRequestError(403, "Invalid CSRF token.");
    }
  }

  private buildSetCookieHeader(
    args: Readonly<{
      name: string;
      value: string;
      request: Request;
      maxAgeSeconds: number;
      httpOnly: boolean;
    }>,
  ): string {
    const secure = this.secureRequestDetector.isSecureRequest(args.request);
    return serialize(args.name, args.value, {
      path: "/",
      maxAge: args.maxAgeSeconds,
      httpOnly: args.httpOnly,
      sameSite: "Lax",
      secure,
    });
  }

  private parseCookieHeader(request: Request): Record<string, string> {
    const raw = request.headers.get("cookie");
    if (!raw) {
      return {};
    }
    return parse(raw);
  }

  private resolveSessionCookieName(secure: boolean): string {
    return secure
      ? AuthSessionCookieFactory.secureSessionCookieName
      : AuthSessionCookieFactory.insecureSessionCookieName;
  }

  private resolveCsrfCookieName(secure: boolean): string {
    return secure ? AuthSessionCookieFactory.secureCsrfCookieName : AuthSessionCookieFactory.insecureCsrfCookieName;
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

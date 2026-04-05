import { inject, injectable } from "@codemation/core";
import { ApplicationRequestError } from "../../../application/ApplicationRequestError";
import { ApplicationTokens } from "../../../applicationTokens";
import type { SessionVerifier } from "../../../application/auth/SessionVerifier";
import { AuthSessionCookieFactory } from "../../../infrastructure/auth/AuthSessionCookieFactory";
import { CodemationBetterAuthRuntime } from "../../../infrastructure/auth/CodemationBetterAuthRuntime";
import { CodemationBetterAuthServerFactory } from "../../../infrastructure/auth/CodemationBetterAuthServerFactory";
import { InAppCallbackUrlPolicy } from "../../../infrastructure/auth/InAppCallbackUrlPolicy";
import type { AppConfig } from "../../config/AppConfig";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";

@injectable()
export class AuthHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.SessionVerifier)
    private readonly sessionVerifier: SessionVerifier,
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
    @inject(AuthSessionCookieFactory)
    private readonly authSessionCookieFactory: AuthSessionCookieFactory,
    @inject(CodemationBetterAuthRuntime)
    private readonly betterAuthRuntime: CodemationBetterAuthRuntime,
    @inject(InAppCallbackUrlPolicy)
    private readonly inAppCallbackUrlPolicy: InAppCallbackUrlPolicy,
  ) {}

  async getSession(request: Request): Promise<Response> {
    try {
      const principal = await this.sessionVerifier.verify(request);
      const csrfCookie = this.authSessionCookieFactory.ensureCsrfCookie(request);
      const headers = new Headers();
      if (csrfCookie.cookieHeader) {
        headers.append("set-cookie", csrfCookie.cookieHeader);
      }
      return new Response(JSON.stringify(principal), {
        status: 200,
        headers,
      });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postLogin(request: Request): Promise<Response> {
    try {
      this.authSessionCookieFactory.assertCsrf(request);
      if (this.appConfig.auth?.kind !== "local") {
        throw new ApplicationRequestError(403, "Local email/password login is not enabled for this configuration.");
      }
      const body = await this.readJsonBody<{ email?: string; password?: string }>(request);
      const auth = this.betterAuthRuntime.getAuthOrThrow();
      const signInUrl = this.resolveForwardedOriginUrl(request, "/api/auth/sign-in/email").toString();
      const internalResponse = await auth.handler(
        new Request(signInUrl, {
          method: "POST",
          headers: this.buildJsonAuthHeaders(request),
          body: JSON.stringify({
            email: body.email ?? "",
            password: body.password ?? "",
          }),
        }),
      );
      if (!internalResponse.ok) {
        return internalResponse;
      }
      const headers = new Headers();
      this.appendAllSetCookieHeaders(headers, internalResponse.headers);
      return new Response(null, { status: 204, headers });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postLogout(request: Request): Promise<Response> {
    try {
      this.authSessionCookieFactory.assertCsrf(request);
      const headers = new Headers();
      const auth = this.betterAuthRuntime.tryGetAuth();
      if (auth) {
        const signOutUrl = this.resolveForwardedOriginUrl(request, "/api/auth/sign-out").toString();
        const signOutResponse = await auth.handler(
          new Request(signOutUrl, {
            method: "POST",
            headers: this.buildInternalAuthHeaders(request),
          }),
        );
        this.appendAllSetCookieHeaders(headers, signOutResponse.headers);
      }
      headers.append("set-cookie", this.authSessionCookieFactory.clearSessionCookie(request));
      return new Response(null, { status: 204, headers });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getOAuthStart(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const providerId = params.providerId ?? "";
      this.assertProviderConfigured(providerId);
      const auth = this.betterAuthRuntime.getAuthOrThrow();
      const requestUrl = new URL(request.url);
      const callbackUrl = requestUrl.searchParams.get("callbackUrl");
      const safeCallbackUrl = callbackUrl
        ? this.inAppCallbackUrlPolicy.resolveSafeRelativeCallbackUrl(callbackUrl)
        : undefined;
      const isOidc = this.resolveOidcProviderIds().has(providerId);
      const targetPath = isOidc ? "/api/auth/sign-in/oauth2" : "/api/auth/sign-in/social";
      const body = isOidc
        ? {
            providerId,
            callbackURL: safeCallbackUrl,
            disableRedirect: true,
          }
        : {
            provider: providerId,
            callbackURL: safeCallbackUrl,
            disableRedirect: true,
          };
      const internalUrl = this.resolveForwardedOriginUrl(request, targetPath).toString();
      const internalResponse = await auth.handler(
        new Request(internalUrl, {
          method: "POST",
          headers: this.buildJsonAuthHeaders(request),
          body: JSON.stringify(body),
        }),
      );
      if (!internalResponse.ok) {
        return internalResponse;
      }
      const payload = (await internalResponse.json()) as { url?: string };
      if (!payload.url || typeof payload.url !== "string") {
        return new Response(JSON.stringify({ error: "OAuth start did not return a redirect URL." }), {
          status: 502,
          headers: { "content-type": "application/json" },
        });
      }
      const redirectHeaders = new Headers();
      redirectHeaders.set("location", payload.url);
      this.appendAllSetCookieHeaders(redirectHeaders, internalResponse.headers);
      return new Response(null, { status: 302, headers: redirectHeaders });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  private assertProviderConfigured(providerId: string): void {
    const configured = CodemationBetterAuthServerFactory.listConfiguredOAuthProviderIds(this.appConfig.auth);
    if (!configured.has(providerId)) {
      throw new ApplicationRequestError(404, `Unknown OAuth provider: ${providerId}`);
    }
  }

  private resolveOidcProviderIds(): ReadonlySet<string> {
    return new Set(this.appConfig.auth?.oidc?.map((o) => o.id) ?? []);
  }

  private resolveForwardedOriginUrl(request: Request, pathname: string): URL {
    const source = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const protocol = forwardedProto && forwardedProto.length > 0 ? `${forwardedProto}:` : source.protocol;
    const host = forwardedHost && forwardedHost.length > 0 ? forwardedHost : source.host;
    return new URL(pathname, `${protocol}//${host}`);
  }

  /**
   * Origin sent to Better Auth for proxied /internal requests must match the same host and scheme
   * as {@link resolveForwardedOriginUrl} (not the client `Origin` header). Otherwise Better Auth's
   * origin check can reject valid flows when cookies exist and `X-Forwarded-*` differs from
   * `request.url`, or when a client sends a misleading `Origin` header.
   */
  private resolveCanonicalOriginForBetterAuthRequest(request: Request): string {
    return this.resolveForwardedOriginUrl(request, "/").origin;
  }

  private buildInternalAuthHeaders(request: Request): Headers {
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("cookie", cookie);
    }
    headers.set("origin", this.resolveCanonicalOriginForBetterAuthRequest(request));
    return headers;
  }

  private buildJsonAuthHeaders(request: Request): Headers {
    const headers = this.buildInternalAuthHeaders(request);
    headers.set("content-type", "application/json");
    return headers;
  }

  private appendAllSetCookieHeaders(target: Headers, source: Headers): void {
    const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie?.bind(source);
    if (getSetCookie) {
      for (const value of getSetCookie()) {
        target.append("set-cookie", value);
      }
      return;
    }
    const single = source.get("set-cookie");
    if (single) {
      target.append("set-cookie", single);
    }
  }

  private async readJsonBody<TBody>(request: Request): Promise<TBody> {
    try {
      return (await request.json()) as TBody;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ApplicationRequestError(400, `Invalid JSON body: ${message}`);
    }
  }
}

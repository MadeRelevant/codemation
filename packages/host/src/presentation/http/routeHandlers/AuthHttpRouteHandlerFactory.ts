import { inject, injectable } from "@codemation/core";
import { ApplicationRequestError } from "../../../application/ApplicationRequestError";
import { ApplicationTokens } from "../../../applicationTokens";
import type { SessionVerifier } from "../../../application/auth/SessionVerifier";
import { UserAccountService } from "../../../domain/users/UserAccountServiceRegistry";
import { AuthSessionCookieFactory } from "../../../infrastructure/auth/AuthSessionCookieFactory";
import { CodemationAuthCore } from "../../../infrastructure/auth/CodemationAuthCore";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";

@injectable()
export class AuthHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.SessionVerifier)
    private readonly sessionVerifier: SessionVerifier,
    @inject(UserAccountService)
    private readonly userAccountService: UserAccountService,
    @inject(AuthSessionCookieFactory)
    private readonly authSessionCookieFactory: AuthSessionCookieFactory,
    @inject(CodemationAuthCore)
    private readonly codemationAuthCore: CodemationAuthCore,
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
      const body = await this.readJsonBody<{ email?: string; password?: string }>(request);
      const principal = await this.userAccountService.authenticateLocalUser(body.email ?? "", body.password ?? "");
      const headers = new Headers();
      headers.append("set-cookie", await this.authSessionCookieFactory.createSessionCookie(request, principal));
      return new Response(null, { status: 204, headers });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postLogout(request: Request): Promise<Response> {
    try {
      this.authSessionCookieFactory.assertCsrf(request);
      const headers = new Headers();
      headers.append("set-cookie", this.authSessionCookieFactory.clearSessionCookie(request));
      return new Response(null, { status: 204, headers });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getOAuthStart(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return await this.codemationAuthCore.startOAuth(request, params.providerId!);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getOAuthCallback(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return await this.codemationAuthCore.handleOAuthCallback(request, params.providerId!);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
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

import { inject } from "@codemation/core";
import serialize from "serialize-javascript";
import { CredentialInstanceService } from "../../../domain/credentials/CredentialServices";
import { OAuth2ConnectService } from "../../../domain/credentials/OAuth2ConnectService";
import { HandlesHttpRoute } from "../HandlesHttpRoute";
import { Route } from "../Route";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";

@HandlesHttpRoute.for()
export class OAuth2HttpRouteHandler {
  constructor(
    @inject(OAuth2ConnectService)
    private readonly oauth2ConnectService: OAuth2ConnectService,
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {}

  @Route.for("GET", "oauth2/auth")
  async getAuthRedirect(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const instanceId = url.searchParams.get("instanceId")?.trim();
      if (!instanceId) {
        return Response.json({ error: "Missing instanceId query parameter." }, { status: 400 });
      }
      const redirect = await this.oauth2ConnectService.createAuthRedirect(instanceId, this.resolveRequestOrigin(request));
      return Response.redirect(redirect.redirectUrl, 302);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("GET", "oauth2/callback")
  async getCallback(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const result = await this.oauth2ConnectService.handleCallback({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        requestOrigin: this.resolveRequestOrigin(request),
      });
      return new Response(this.createPopupHtml({ kind: "oauth2.connected", ...result }), {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(this.createPopupHtml({ kind: "oauth2.error", message }), {
        status: 400,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }
  }

  @Route.for("GET", "oauth2/redirect-uri")
  async getRedirectUri(request: Request): Promise<Response> {
    try {
      return Response.json({
        redirectUri: this.oauth2ConnectService.getRedirectUri(this.resolveRequestOrigin(request)),
      });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("POST", "oauth2/disconnect")
  async postDisconnect(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const instanceId = url.searchParams.get("instanceId")?.trim();
      if (!instanceId) {
        return Response.json({ error: "Missing instanceId query parameter." }, { status: 400 });
      }
      return Response.json(await this.credentialInstanceService.disconnectOAuth2(instanceId));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  private resolveRequestOrigin(request: Request): string {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
    if (forwardedProto && forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }
    const host = request.headers.get("host")?.trim();
    if (host) {
      return `${new URL(request.url).protocol}//${host}`;
    }
    return new URL(request.url).origin;
  }

  /**
   * Serialize popup payload for an inline script using `serialize-javascript`
   * (Webpack / HTML plugin stack): escapes angle brackets, slashes, and Unicode line
   * terminators so string values cannot break out of the script block.
   */
  private createPopupHtml(message: Readonly<Record<string, unknown>>): string {
    const safeLiteral = serialize(message, { isJSON: true });
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>OAuth2 connection</title>
  </head>
  <body>
    <script>
      (function () {
        const message = ${safeLiteral};
        if (window.opener) {
          window.opener.postMessage(message, window.location.origin);
        }
        window.close();
      })();
    </script>
    <p>You can close this window.</p>
  </body>
</html>`;
  }
}

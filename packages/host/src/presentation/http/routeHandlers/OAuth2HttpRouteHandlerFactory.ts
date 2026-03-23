import { inject,injectable } from "@codemation/core";
import serialize from "serialize-javascript";
import { CredentialInstanceService } from "../../../domain/credentials/CredentialServices";
import { OAuth2ConnectService } from "../../../domain/credentials/OAuth2ConnectServiceFactory";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";

@injectable()
export class OAuth2HttpRouteHandler {
  constructor(
    @inject(OAuth2ConnectService)
    private readonly oauth2ConnectService: OAuth2ConnectService,
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {}

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

  async getRedirectUri(request: Request): Promise<Response> {
    try {
      return Response.json({
        redirectUri: this.oauth2ConnectService.getRedirectUri(this.resolveRequestOrigin(request)),
      });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

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
    const forwardedProto = OAuth2HttpRouteHandler.firstCommaSeparatedValue(
      request.headers.get("x-forwarded-proto"),
    );
    const forwardedHost = OAuth2HttpRouteHandler.firstCommaSeparatedValue(
      request.headers.get("x-forwarded-host"),
    );
    if (forwardedProto && forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }
    const host = OAuth2HttpRouteHandler.firstCommaSeparatedValue(request.headers.get("host"));
    if (host) {
      return `${new URL(request.url).protocol}//${host}`;
    }
    return new URL(request.url).origin;
  }

  /** Proxies may send comma-separated lists (chain); use the first host/proto only. */
  private static firstCommaSeparatedValue(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.split(",")[0]?.trim();
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

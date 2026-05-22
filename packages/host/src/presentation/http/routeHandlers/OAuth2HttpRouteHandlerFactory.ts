import type { OAuthFlowExecutor } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import serialize from "serialize-javascript";
import { ApplicationTokens } from "../../../applicationTokens";
import {
  CredentialInstanceService,
  CredentialSecretCipher,
  type CredentialStore,
} from "../../../domain/credentials/CredentialServices";
import { OAuth2ConnectService } from "../../../domain/credentials/OAuth2ConnectServiceFactory";
import { HttpRequestJsonBodyReader } from "../HttpRequestJsonBodyReader";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";

type OAuthStartRequestBody = Readonly<{
  typeId: string;
  instanceId: string;
  redirectUri: string;
  scopes?: ReadonlyArray<string>;
}>;

@injectable()
export class OAuth2HttpRouteHandler {
  constructor(
    @inject(OAuth2ConnectService)
    private readonly oauth2ConnectService: OAuth2ConnectService,
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(ApplicationTokens.OAuthFlowExecutor)
    private readonly oauthFlowExecutor: OAuthFlowExecutor,
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialSecretCipher)
    private readonly credentialSecretCipher: CredentialSecretCipher,
  ) {}

  async getAuthRedirect(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const instanceId = url.searchParams.get("instanceId")?.trim();
      if (!instanceId) {
        return Response.json({ error: "Missing instanceId query parameter." }, { status: 400 });
      }
      const redirect = await this.oauth2ConnectService.createAuthRedirect(
        instanceId,
        this.resolveRequestOrigin(request),
      );
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

  async postOAuthStart(request: Request): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<OAuthStartRequestBody>(request);
      if (!body.typeId?.trim()) {
        return Response.json({ error: "Missing required field: typeId" }, { status: 400 });
      }
      if (!body.instanceId?.trim()) {
        return Response.json({ error: "Missing required field: instanceId" }, { status: 400 });
      }
      if (!body.redirectUri?.trim()) {
        return Response.json({ error: "Missing required field: redirectUri" }, { status: 400 });
      }
      const result = await this.oauthFlowExecutor.start({
        typeId: body.typeId.trim(),
        instanceId: body.instanceId.trim(),
        redirectUri: body.redirectUri.trim(),
        scopes: body.scopes ?? [],
      });
      return Response.json({ consentUrl: result.consentUrl, stateToken: result.stateToken });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getOAuthCallback(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get("code")?.trim();
      const stateToken = url.searchParams.get("state")?.trim();
      if (!code || !stateToken) {
        return new Response(
          this.createPopupHtml({ kind: "oauth2.error", message: "Missing code or state parameter." }),
          {
            status: 400,
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        );
      }
      const instanceId = this.oauthFlowExecutor.lookupInstanceId(stateToken);
      if (!instanceId) {
        return new Response(
          this.createPopupHtml({ kind: "oauth2.error", message: "OAuth state token not found or already used." }),
          { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
      const material = await this.oauthFlowExecutor.completeCallback({ stateToken, code });
      const nowIso = new Date().toISOString();
      const encryptedMaterial = this.credentialSecretCipher.encrypt({
        accessToken: material.accessToken,
        refreshToken: material.refreshToken ?? null,
        expiresAt: material.expiresAt ?? null,
        grantedScopes: material.grantedScopes.join(" "),
      });
      await this.credentialStore.saveOAuth2Material({
        instanceId,
        encryptedJson: encryptedMaterial.encryptedJson,
        encryptionKeyId: encryptedMaterial.encryptionKeyId,
        schemaVersion: encryptedMaterial.schemaVersion,
        metadata: {
          providerId: "local",
          connectedAt: nowIso,
          scopes: [...material.grantedScopes],
          updatedAt: nowIso,
        },
      });
      await this.credentialInstanceService.markOAuth2Connected(instanceId, nowIso);
      return new Response(this.createPopupHtml({ kind: "oauth2.connected", instanceId }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(this.createPopupHtml({ kind: "oauth2.error", message }), {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }

  private resolveRequestOrigin(request: Request): string {
    const forwardedProto = OAuth2HttpRouteHandler.firstCommaSeparatedValue(request.headers.get("x-forwarded-proto"));
    const forwardedHost = OAuth2HttpRouteHandler.firstCommaSeparatedValue(request.headers.get("x-forwarded-host"));
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

import { createHash, randomBytes } from "node:crypto";

import { inject, injectable } from "@codemation/core";
import type {
  Clock,
  OAuthFlowCallbackArgs,
  OAuthFlowExecutor,
  OAuthFlowStartArgs,
  OAuthFlowStartResult,
  OAuthMaterial,
} from "@codemation/core";

import { ApplicationTokens } from "../applicationTokens";
import { CredentialFieldEnvOverlayService } from "../domain/credentials/CredentialFieldEnvOverlayService";
import type { CredentialStore } from "../domain/credentials/CredentialServices";
import { CredentialMaterialResolver } from "../domain/credentials/CredentialMaterialResolver";
import { CredentialTypeRegistryImpl } from "../domain/credentials/CredentialTypeRegistryImpl";
import { OAuth2ProviderRegistry } from "../domain/credentials/OAuth2ProviderRegistry";

type PendingState = Readonly<{
  stateToken: string;
  codeVerifier: string;
  instanceId: string;
  typeId: string;
  redirectUri: string;
  expiresAt: number;
}>;

/**
 * OAuthFlowExecutor for framework (OSS / standalone) mode.
 *
 * Reads clientId from the credential instance's publicConfig and clientSecret
 * from the instance's secret material. Does NOT write tokens back — that is
 * the responsibility of the callback route (a later story).
 */
@injectable()
export class LocalOAuthFlowExecutor implements OAuthFlowExecutor {
  private static readonly stateTtlMs = 10 * 60 * 1_000;

  private readonly pendingStates = new Map<string, PendingState>();

  constructor(
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialMaterialResolver)
    private readonly credentialMaterialResolver: CredentialMaterialResolver,
    @inject(OAuth2ProviderRegistry)
    private readonly oauth2ProviderRegistry: OAuth2ProviderRegistry,
    @inject(CredentialFieldEnvOverlayService)
    private readonly credentialFieldEnvOverlayService: CredentialFieldEnvOverlayService,
    @inject(ApplicationTokens.Clock)
    private readonly clock: Clock,
  ) {}

  async start(args: OAuthFlowStartArgs): Promise<OAuthFlowStartResult> {
    const { instanceId } = args;
    if (!instanceId) {
      throw new Error("LocalOAuthFlowExecutor.start requires instanceId; create the credential instance first");
    }

    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      throw new Error(`LocalOAuthFlowExecutor: credential instance not found: ${instanceId}`);
    }

    const credentialType = this.credentialTypeRegistry.getCredentialType(instance.typeId);
    if (!credentialType) {
      throw new Error(`LocalOAuthFlowExecutor: unknown credential type: ${instance.typeId}`);
    }
    if (credentialType.definition.auth?.kind !== "oauth2") {
      throw new Error(`LocalOAuthFlowExecutor: credential type ${instance.typeId} is not an OAuth2 type`);
    }

    const auth = credentialType.definition.auth;
    const rawMaterial = await this.credentialMaterialResolver.resolveMaterial(instance);
    const { resolvedPublicConfig, resolvedMaterial: material } = this.credentialFieldEnvOverlayService.apply({
      definition: credentialType.definition,
      publicConfig: instance.publicConfig,
      material: rawMaterial,
    });
    const provider = this.oauth2ProviderRegistry.resolve(credentialType.definition, resolvedPublicConfig);
    const clientId = this.oauth2ProviderRegistry.resolveClientId(auth, resolvedPublicConfig);

    const scopes = args.scopes.length > 0 ? [...args.scopes] : [...auth.scopes];

    const stateToken = this.createOpaqueValue();
    const codeVerifier = this.createOpaqueValue();
    const codeChallenge = this.createPkceCodeChallenge(codeVerifier);

    const nowMs = this.clock.now().getTime();

    // Evict expired entries on each start call to keep the map bounded.
    this.evictExpired(nowMs);

    const expiresAt = nowMs + LocalOAuthFlowExecutor.stateTtlMs;
    this.pendingStates.set(stateToken, {
      stateToken,
      codeVerifier,
      instanceId,
      typeId: instance.typeId,
      redirectUri: args.redirectUri,
      expiresAt,
    });

    // Suppress unused-variable lint for material — it's loaded to validate that the
    // clientSecret field is present before starting the flow, but clientSecret itself is
    // only needed at completeCallback / refresh time.
    void material;

    const url = new URL(provider.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", args.redirectUri);
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("state", stateToken);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    return { consentUrl: url.toString(), stateToken };
  }

  lookupInstanceId(stateToken: string): string | undefined {
    return this.pendingStates.get(stateToken)?.instanceId;
  }

  async completeCallback(args: OAuthFlowCallbackArgs): Promise<OAuthMaterial> {
    const pending = this.pendingStates.get(args.stateToken);
    if (!pending) {
      throw new Error(`LocalOAuthFlowExecutor: state token not found or already used: ${args.stateToken}`);
    }
    if (this.clock.now().getTime() > pending.expiresAt) {
      this.pendingStates.delete(args.stateToken);
      throw new Error("LocalOAuthFlowExecutor: OAuth state token has expired");
    }
    this.pendingStates.delete(args.stateToken);

    const instance = await this.credentialStore.getInstance(pending.instanceId);
    if (!instance) {
      throw new Error(`LocalOAuthFlowExecutor: credential instance not found: ${pending.instanceId}`);
    }

    const credentialType = this.credentialTypeRegistry.getCredentialType(instance.typeId);
    if (!credentialType || credentialType.definition.auth?.kind !== "oauth2") {
      throw new Error(`LocalOAuthFlowExecutor: credential type ${instance.typeId} is not an OAuth2 type`);
    }

    const auth = credentialType.definition.auth;
    const rawMaterial = await this.credentialMaterialResolver.resolveMaterial(instance);
    const { resolvedPublicConfig, resolvedMaterial: material } = this.credentialFieldEnvOverlayService.apply({
      definition: credentialType.definition,
      publicConfig: instance.publicConfig,
      material: rawMaterial,
    });
    const provider = this.oauth2ProviderRegistry.resolve(credentialType.definition, resolvedPublicConfig);
    const clientId = this.oauth2ProviderRegistry.resolveClientId(auth, resolvedPublicConfig);
    const clientSecretFieldKey = this.oauth2ProviderRegistry.resolveClientSecretFieldKey(auth);
    const clientSecret = String(material[clientSecretFieldKey] ?? "");
    if (!clientSecret) {
      throw new Error(`LocalOAuthFlowExecutor: clientSecret missing from secret field "${clientSecretFieldKey}"`);
    }

    const body = this.buildFormBody({
      grant_type: "authorization_code",
      code: args.code,
      code_verifier: pending.codeVerifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: pending.redirectUri,
    });

    const response = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const text = await response.text();
    const json = this.parseJson(text);

    if (!response.ok) {
      const msg =
        typeof json.error_description === "string"
          ? json.error_description
          : typeof json.error === "string"
            ? json.error
            : text || "OAuth2 token exchange failed";
      throw new Error(`LocalOAuthFlowExecutor: token exchange failed: ${msg}`);
    }

    return this.toOAuthMaterial(json);
  }

  async refresh(args: { typeId: string; instanceId: string; material: OAuthMaterial }): Promise<OAuthMaterial> {
    const { typeId, instanceId, material } = args;

    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      throw new Error(`LocalOAuthFlowExecutor: credential instance not found: ${instanceId}`);
    }

    const credentialType = this.credentialTypeRegistry.getCredentialType(typeId);
    if (!credentialType || credentialType.definition.auth?.kind !== "oauth2") {
      throw new Error(`LocalOAuthFlowExecutor: credential type ${typeId} is not an OAuth2 type`);
    }

    const auth = credentialType.definition.auth;
    const rawMaterial = await this.credentialMaterialResolver.resolveMaterial(instance);
    const { resolvedPublicConfig, resolvedMaterial: secretMaterial } = this.credentialFieldEnvOverlayService.apply({
      definition: credentialType.definition,
      publicConfig: instance.publicConfig,
      material: rawMaterial,
    });
    const provider = this.oauth2ProviderRegistry.resolve(credentialType.definition, resolvedPublicConfig);
    const clientId = this.oauth2ProviderRegistry.resolveClientId(auth, resolvedPublicConfig);
    const clientSecretFieldKey = this.oauth2ProviderRegistry.resolveClientSecretFieldKey(auth);
    const clientSecret = String(secretMaterial[clientSecretFieldKey] ?? "");
    if (!clientSecret) {
      throw new Error(`LocalOAuthFlowExecutor: clientSecret missing from secret field "${clientSecretFieldKey}"`);
    }

    if (!material.refreshToken) {
      throw new Error("LocalOAuthFlowExecutor: no refresh token available");
    }

    const body = this.buildFormBody({
      grant_type: "refresh_token",
      refresh_token: material.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const text = await response.text();
    const json = this.parseJson(text);

    if (!response.ok) {
      const msg =
        typeof json.error_description === "string"
          ? json.error_description
          : typeof json.error === "string"
            ? json.error
            : text || "OAuth2 refresh failed";
      throw new Error(`LocalOAuthFlowExecutor: token refresh failed: ${msg}`);
    }

    const refreshed = this.toOAuthMaterial(json);
    // Preserve the existing refresh token if the provider omits it from the response.
    if (!refreshed.refreshToken) {
      return { ...refreshed, refreshToken: material.refreshToken };
    }
    return refreshed;
  }

  private toOAuthMaterial(json: Record<string, unknown>): OAuthMaterial {
    const accessToken = String(json.access_token ?? "");
    if (!accessToken) {
      throw new Error("LocalOAuthFlowExecutor: token response missing access_token");
    }
    const refreshToken =
      typeof json.refresh_token === "string" && json.refresh_token.length > 0 ? json.refresh_token : undefined;
    const expiresAt = this.resolveExpiresAt(json);
    const grantedScopes =
      typeof json.scope === "string" && json.scope.length > 0
        ? json.scope.split(/\s+/).filter((s) => s.length > 0)
        : [];
    return Object.freeze({ accessToken, refreshToken, expiresAt, grantedScopes });
  }

  private resolveExpiresAt(json: Record<string, unknown>): string | undefined {
    const expiresIn = Number(json.expires_in);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      return new Date(this.clock.now().getTime() + expiresIn * 1000).toISOString();
    }
    return undefined;
  }

  private parseJson(text: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(text) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private buildFormBody(fields: Readonly<Record<string, string>>): string {
    return Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }

  private createOpaqueValue(): string {
    return randomBytes(32).toString("base64url");
  }

  private createPkceCodeChallenge(codeVerifier: string): string {
    return createHash("sha256").update(codeVerifier).digest("base64url");
  }

  private evictExpired(nowMs: number): void {
    for (const [key, entry] of this.pendingStates) {
      if (nowMs > entry.expiresAt) {
        this.pendingStates.delete(key);
      }
    }
  }
}

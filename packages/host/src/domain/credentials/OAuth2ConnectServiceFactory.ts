import type { CredentialOAuth2AuthDefinition } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { createHash, randomBytes } from "node:crypto";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import { ApplicationTokens } from "../../applicationTokens";
import type { CredentialStore } from "./CredentialServices";
import {
  CredentialFieldEnvOverlayService,
  CredentialInstanceService,
  CredentialMaterialResolver,
  CredentialRuntimeMaterialService,
  CredentialSecretCipher,
  CredentialTypeRegistryImpl,
} from "./CredentialServices";
import { OAuth2ProviderRegistry } from "./OAuth2ProviderRegistry";

type JsonRecord = Readonly<Record<string, unknown>>;

export type OAuth2AuthRedirectResult = Readonly<{
  instanceId: string;
  redirectUri: string;
  redirectUrl: string;
}>;

export type OAuth2CallbackResult = Readonly<{
  instanceId: string;
  connectedEmail?: string;
}>;

@injectable()
export class OAuth2ConnectService {
  private static readonly stateTtlMs = 10 * 60 * 1_000;

  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(CredentialRuntimeMaterialService)
    private readonly credentialRuntimeMaterialService: CredentialRuntimeMaterialService,
    @inject(CredentialFieldEnvOverlayService)
    private readonly credentialFieldEnvOverlayService: CredentialFieldEnvOverlayService,
    @inject(CredentialMaterialResolver)
    private readonly credentialMaterialResolver: CredentialMaterialResolver,
    @inject(CredentialSecretCipher)
    private readonly credentialSecretCipher: CredentialSecretCipher,
    @inject(OAuth2ProviderRegistry)
    private readonly oauth2ProviderRegistry: OAuth2ProviderRegistry,
    @inject(ApplicationTokens.ProcessEnv)
    private readonly env: Readonly<NodeJS.ProcessEnv>,
  ) {}

  async createAuthRedirect(instanceId: string, requestOrigin: string): Promise<OAuth2AuthRedirectResult> {
    const instance = await this.credentialInstanceService.requireInstance(instanceId);
    const registeredType = this.requireOAuth2Type(instance.typeId);
    const emptyMaterial = await this.credentialMaterialResolver.resolveMaterial(instance);
    const { resolvedPublicConfig } = this.credentialFieldEnvOverlayService.apply({
      definition: registeredType.definition,
      publicConfig: instance.publicConfig,
      material: emptyMaterial,
    });
    const provider = this.oauth2ProviderRegistry.resolve(registeredType.definition, resolvedPublicConfig);
    const redirectUri = this.getRedirectUri(requestOrigin);
    const state = this.createOpaqueValue();
    const codeVerifier = this.createOpaqueValue();
    const codeChallenge = this.createPkceCodeChallenge(codeVerifier);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + OAuth2ConnectService.stateTtlMs);
    await this.credentialStore.createOAuth2State({
      state,
      instanceId,
      codeVerifier,
      providerId: provider.providerId,
      requestedScopes: registeredType.definition.auth!.scopes,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    const authorizeUrl = new URL(provider.authorizeUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set(
      "client_id",
      this.oauth2ProviderRegistry.resolveClientId(registeredType.definition.auth!, resolvedPublicConfig),
    );
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", registeredType.definition.auth!.scopes.join(" "));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    if (provider.providerId === "google") {
      authorizeUrl.searchParams.set("access_type", "offline");
      authorizeUrl.searchParams.set("prompt", "consent");
    }
    return {
      instanceId,
      redirectUri,
      redirectUrl: authorizeUrl.toString(),
    };
  }

  async handleCallback(
    args: Readonly<{
      code?: string | null;
      state?: string | null;
      requestOrigin: string;
    }>,
  ): Promise<OAuth2CallbackResult> {
    const code = args.code?.trim();
    const state = args.state?.trim();
    if (!code || !state) {
      throw new ApplicationRequestError(400, "OAuth2 callback requires both code and state.");
    }
    const storedState = await this.credentialStore.consumeOAuth2State(state);
    if (!storedState) {
      throw new ApplicationRequestError(400, "OAuth2 state is invalid or has already been used.");
    }
    if (new Date(storedState.expiresAt).getTime() <= Date.now()) {
      throw new ApplicationRequestError(400, "OAuth2 state has expired. Start the connection flow again.");
    }
    const instance = await this.credentialInstanceService.requireInstance(storedState.instanceId);
    const registeredType = this.requireOAuth2Type(instance.typeId);
    const auth = registeredType.definition.auth!;
    const composedMaterial = await this.credentialRuntimeMaterialService.compose(instance);
    const { resolvedPublicConfig, resolvedMaterial } = this.credentialFieldEnvOverlayService.apply({
      definition: registeredType.definition,
      publicConfig: instance.publicConfig,
      material: composedMaterial,
    });
    const provider = this.oauth2ProviderRegistry.resolve(registeredType.definition, resolvedPublicConfig);
    const redirectUri = this.getRedirectUri(args.requestOrigin);
    const tokenResponse = await this.exchangeAuthorizationCode({
      auth,
      code,
      codeVerifier: storedState.codeVerifier,
      provider,
      publicConfig: resolvedPublicConfig,
      redirectUri,
      secretMaterial: resolvedMaterial,
    });
    const nowIso = new Date().toISOString();
    const existingMaterial = await this.credentialStore.getOAuth2Material(instance.instanceId);
    const mergedTokenMaterial = this.mergeTokenMaterial(
      existingMaterial ? this.credentialSecretCipher.decrypt(existingMaterial) : undefined,
      tokenResponse,
      nowIso,
      storedState.requestedScopes,
    );
    const encryptedMaterial = this.credentialSecretCipher.encrypt(mergedTokenMaterial);
    const connectedEmail = await this.resolveConnectedEmail(provider.userInfoUrl, tokenResponse.access_token);
    await this.credentialStore.saveOAuth2Material({
      instanceId: instance.instanceId,
      encryptedJson: encryptedMaterial.encryptedJson,
      encryptionKeyId: encryptedMaterial.encryptionKeyId,
      schemaVersion: encryptedMaterial.schemaVersion,
      metadata: {
        providerId: provider.providerId,
        connectedEmail,
        connectedAt: nowIso,
        scopes: this.resolveGrantedScopes(tokenResponse.scope, storedState.requestedScopes),
        updatedAt: nowIso,
      },
    });
    await this.credentialInstanceService.markOAuth2Connected(instance.instanceId, nowIso);
    return {
      instanceId: instance.instanceId,
      connectedEmail,
    };
  }

  getRedirectUri(requestOrigin: string): string {
    const rawBase = this.env.CODEMATION_PUBLIC_BASE_URL?.trim() || requestOrigin.trim();
    if (!rawBase) {
      throw new Error("Unable to resolve the public base URL for OAuth2 redirect URI generation.");
    }
    const baseUrl = this.ensureAbsoluteUrlForOAuth2Base(rawBase);
    try {
      return new URL("/api/oauth2/callback", this.normalizeBaseUrl(baseUrl)).toString();
    } catch {
      throw new ApplicationRequestError(
        500,
        `Invalid public base URL for OAuth2 redirect URI generation: "${rawBase}". Use a full URL (e.g. http://localhost:3000) for CODEMATION_PUBLIC_BASE_URL or ensure the request has a valid Host / forwarded headers.`,
      );
    }
  }

  /**
   * `new URL(path, base)` requires `base` to be an absolute URL with a scheme.
   * Misconfigured CODEMATION_PUBLIC_BASE_URL (e.g. `localhost:3000` without http://) or odd
   * forwarded headers otherwise throw TypeError: Invalid URL.
   *
   * Comma-separated values (proxy chains or copy-paste mistakes like `http,http`) use the
   * first segment only; obviously invalid hostnames are rejected.
   */
  private ensureAbsoluteUrlForOAuth2Base(raw: string): string {
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

  private requireOAuth2Type(typeId: string) {
    const registeredType = this.credentialTypeRegistry.getRegisteredType(typeId);
    if (!registeredType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${typeId}`);
    }
    if (registeredType.definition.auth?.kind !== "oauth2") {
      throw new ApplicationRequestError(400, `Credential type ${typeId} is not configured for OAuth2.`);
    }
    return registeredType;
  }

  private async exchangeAuthorizationCode(
    args: Readonly<{
      auth: CredentialOAuth2AuthDefinition;
      code: string;
      codeVerifier?: string;
      provider: Readonly<{
        authorizeUrl: string;
        tokenUrl: string;
        userInfoUrl?: string;
        providerId: string;
      }>;
      publicConfig: JsonRecord;
      redirectUri: string;
      secretMaterial: JsonRecord;
    }>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const requestBody = new URLSearchParams();
    requestBody.set("grant_type", "authorization_code");
    requestBody.set("code", args.code);
    requestBody.set("redirect_uri", args.redirectUri);
    requestBody.set("client_id", this.oauth2ProviderRegistry.resolveClientId(args.auth, args.publicConfig));
    const clientSecretFieldKey = this.oauth2ProviderRegistry.resolveClientSecretFieldKey(args.auth);
    const clientSecret = String(args.secretMaterial[clientSecretFieldKey] ?? "");
    if (!clientSecret) {
      throw new ApplicationRequestError(
        400,
        `OAuth2 client secret is missing from secret field "${clientSecretFieldKey}".`,
      );
    }
    requestBody.set("client_secret", clientSecret);
    if (args.codeVerifier) {
      requestBody.set("code_verifier", args.codeVerifier);
    }
    const response = await fetch(args.provider.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: requestBody.toString(),
    });
    const responseText = await response.text();
    const responseBody = this.parseJsonRecord(responseText);
    if (!response.ok) {
      throw new ApplicationRequestError(400, this.createTokenExchangeErrorMessage(responseBody, responseText));
    }
    return responseBody;
  }

  private mergeTokenMaterial(
    existingMaterial: JsonRecord | undefined,
    tokenResponse: Readonly<Record<string, unknown>>,
    nowIso: string,
    requestedScopes: ReadonlyArray<string>,
  ): JsonRecord {
    const accessToken = tokenResponse.access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new ApplicationRequestError(400, "OAuth2 token exchange did not return an access_token.");
    }
    const nextRefreshToken = tokenResponse.refresh_token ?? existingMaterial?.refresh_token;
    const nextScope = tokenResponse.scope ?? requestedScopes.join(" ");
    const expiry = this.resolveExpiry(tokenResponse, nowIso);
    return Object.freeze({
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      token_type: tokenResponse.token_type,
      scope: nextScope,
      expiry,
    });
  }

  private resolveExpiry(tokenResponse: Readonly<Record<string, unknown>>, nowIso: string): string | undefined {
    const expiresInSeconds = Number(tokenResponse.expires_in);
    if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
      return new Date(new Date(nowIso).getTime() + expiresInSeconds * 1000).toISOString();
    }
    const explicitExpiry = tokenResponse.expiry;
    return typeof explicitExpiry === "string" && explicitExpiry.length > 0 ? explicitExpiry : undefined;
  }

  private resolveGrantedScopes(
    grantedScopeValue: unknown,
    requestedScopes: ReadonlyArray<string>,
  ): ReadonlyArray<string> {
    if (typeof grantedScopeValue !== "string" || grantedScopeValue.trim().length === 0) {
      return [...requestedScopes];
    }
    return grantedScopeValue
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  private async resolveConnectedEmail(
    userInfoUrl: string | undefined,
    accessToken: unknown,
  ): Promise<string | undefined> {
    if (!userInfoUrl || typeof accessToken !== "string" || accessToken.length === 0) {
      return undefined;
    }
    const response = await fetch(userInfoUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      return undefined;
    }
    const responseBody = this.parseJsonRecord(await response.text());
    return this.findEmail(responseBody);
  }

  private findEmail(value: JsonRecord): string | undefined {
    const email = value.email;
    if (typeof email === "string" && email.length > 0) {
      return email;
    }
    const nestedUser = value.user;
    if (nestedUser && typeof nestedUser === "object" && "email" in nestedUser) {
      const nestedEmail = (nestedUser as Readonly<Record<string, unknown>>).email;
      return typeof nestedEmail === "string" && nestedEmail.length > 0 ? nestedEmail : undefined;
    }
    return undefined;
  }

  private parseJsonRecord(value: string): JsonRecord {
    if (!value) {
      return {};
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as JsonRecord) : {};
    } catch {
      return {};
    }
  }

  private createTokenExchangeErrorMessage(responseBody: JsonRecord, rawText: string): string {
    const description = responseBody.error_description;
    if (typeof description === "string" && description.length > 0) {
      return description;
    }
    const error = responseBody.error;
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
    return rawText || "OAuth2 token exchange failed.";
  }

  private createOpaqueValue(): string {
    return randomBytes(32).toString("base64url");
  }

  private createPkceCodeChallenge(codeVerifier: string): string {
    return createHash("sha256").update(codeVerifier).digest("base64url");
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }
}

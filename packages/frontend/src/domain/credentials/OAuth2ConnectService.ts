import { createHash, randomBytes } from "node:crypto";
import type { CredentialOAuth2AuthDefinition } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import { ApplicationTokens } from "../../applicationTokens";
import type { CredentialStore } from "./CredentialServices";
import {
  CredentialInstanceService,
  CredentialMaterialResolver,
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
    const provider = this.oauth2ProviderRegistry.resolve(registeredType.definition, instance.publicConfig);
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
      this.oauth2ProviderRegistry.resolveClientId(registeredType.definition.auth!, instance.publicConfig),
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
    const provider = this.oauth2ProviderRegistry.resolve(registeredType.definition, instance.publicConfig);
    const redirectUri = this.getRedirectUri(args.requestOrigin);
    const secretMaterial = await this.credentialMaterialResolver.resolveMaterial(instance);
    const tokenResponse = await this.exchangeAuthorizationCode({
      auth,
      code,
      codeVerifier: storedState.codeVerifier,
      provider,
      publicConfig: instance.publicConfig,
      redirectUri,
      secretMaterial,
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
    const baseUrl = this.env.CODEMATION_PUBLIC_BASE_URL?.trim() || requestOrigin.trim();
    if (!baseUrl) {
      throw new Error("Unable to resolve the public base URL for OAuth2 redirect URI generation.");
    }
    return new URL("/api/oauth2/callback", this.normalizeBaseUrl(baseUrl)).toString();
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

  private async exchangeAuthorizationCode(args: Readonly<{
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
  }>): Promise<Readonly<Record<string, unknown>>> {
    const requestBody = new URLSearchParams();
    requestBody.set("grant_type", "authorization_code");
    requestBody.set("code", args.code);
    requestBody.set("redirect_uri", args.redirectUri);
    requestBody.set("client_id", this.oauth2ProviderRegistry.resolveClientId(args.auth, args.publicConfig));
    const clientSecretFieldKey = this.oauth2ProviderRegistry.resolveClientSecretFieldKey(args.auth);
    const clientSecret = String(args.secretMaterial[clientSecretFieldKey] ?? "");
    if (!clientSecret) {
      throw new ApplicationRequestError(400, `OAuth2 client secret is missing from secret field "${clientSecretFieldKey}".`);
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

  private async resolveConnectedEmail(userInfoUrl: string | undefined, accessToken: unknown): Promise<string | undefined> {
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

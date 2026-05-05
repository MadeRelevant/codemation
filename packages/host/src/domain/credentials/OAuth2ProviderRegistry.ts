import type { CredentialOAuth2AuthDefinition, CredentialTypeDefinition } from "@codemation/core";
import { injectable } from "@codemation/core";

type JsonRecord = Readonly<Record<string, unknown>>;

export type OAuth2ResolvedProvider = Readonly<{
  providerId: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
}>;

@injectable()
export class OAuth2ProviderRegistry {
  private static readonly googleProvider = Object.freeze({
    providerId: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  } satisfies OAuth2ResolvedProvider);

  resolve(definition: CredentialTypeDefinition, publicConfig: JsonRecord): OAuth2ResolvedProvider {
    const auth = definition.auth;
    if (auth?.kind !== "oauth2") {
      throw new Error(`Credential type ${definition.typeId} does not use OAuth2.`);
    }
    if ("authorizeUrl" in auth && "tokenUrl" in auth) {
      return this.resolveTemplateProvider(auth, publicConfig);
    }
    if ("providerId" in auth) {
      return this.resolveBuiltInProvider(auth);
    }
    return this.resolvePublicConfigProvider(auth, publicConfig, definition.typeId);
  }

  resolveClientId(auth: CredentialOAuth2AuthDefinition, publicConfig: JsonRecord): string {
    const clientIdFieldKey = auth.clientIdFieldKey ?? "clientId";
    const clientId = String(publicConfig[clientIdFieldKey] ?? "");
    if (!clientId) {
      throw new Error(`OAuth2 client id is missing from public field "${clientIdFieldKey}".`);
    }
    return clientId;
  }

  resolveClientSecretFieldKey(auth: CredentialOAuth2AuthDefinition): string {
    return auth.clientSecretFieldKey ?? "clientSecret";
  }

  private resolveBuiltInProvider(
    auth: Extract<CredentialOAuth2AuthDefinition, { providerId: string }>,
  ): OAuth2ResolvedProvider {
    if (auth.providerId === "google") {
      return OAuth2ProviderRegistry.googleProvider;
    }
    throw new Error(
      `Unsupported OAuth2 provider id: ${auth.providerId}. ` +
        `Plugin credential types should declare authorizeUrl and tokenUrl directly ` +
        `(supports {publicFieldKey} templates) instead of relying on a built-in provider id.`,
    );
  }

  private resolveTemplateProvider(
    auth: Extract<CredentialOAuth2AuthDefinition, { authorizeUrl: string; tokenUrl: string }>,
    publicConfig: JsonRecord,
  ): OAuth2ResolvedProvider {
    return {
      providerId: auth.providerId,
      authorizeUrl: this.expandTemplate(auth.authorizeUrl, publicConfig),
      tokenUrl: this.expandTemplate(auth.tokenUrl, publicConfig),
      userInfoUrl: auth.userInfoUrl ? this.expandTemplate(auth.userInfoUrl, publicConfig) : undefined,
    };
  }

  private expandTemplate(template: string, publicConfig: JsonRecord): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, fieldKey: string) => {
      const value = publicConfig[fieldKey];
      if (value === undefined || value === null || value === "") {
        throw new Error(`OAuth2 URL template references public field "${fieldKey}" but no value was provided.`);
      }
      return encodeURIComponent(String(value));
    });
  }

  private resolvePublicConfigProvider(
    auth: Extract<CredentialOAuth2AuthDefinition, { providerFromPublicConfig: object }>,
    publicConfig: JsonRecord,
    typeId: string,
  ): OAuth2ResolvedProvider {
    const authorizeUrl = String(publicConfig[auth.providerFromPublicConfig.authorizeUrlFieldKey] ?? "");
    const tokenUrl = String(publicConfig[auth.providerFromPublicConfig.tokenUrlFieldKey] ?? "");
    const userInfoUrl = auth.providerFromPublicConfig.userInfoUrlFieldKey
      ? String(publicConfig[auth.providerFromPublicConfig.userInfoUrlFieldKey] ?? "")
      : "";
    if (!authorizeUrl || !tokenUrl) {
      throw new Error(`OAuth2 provider URLs are incomplete for credential type ${typeId}.`);
    }
    return {
      providerId: "custom",
      authorizeUrl,
      tokenUrl,
      userInfoUrl: userInfoUrl || undefined,
    };
  }
}

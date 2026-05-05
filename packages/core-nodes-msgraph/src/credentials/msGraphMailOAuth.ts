import type { AnyCredentialType, CredentialSessionFactoryArgs } from "@codemation/core";
import { MsGraphOAuthFieldsBuilder } from "./MsGraphOAuthFieldsBuilder";
import { MAIL_SCOPE_PRESETS, resolveMailScopes, type MailScopePreset } from "./scopes";
import { createGraphClient, createMsGraphOAuthSession, type MsGraphSession } from "./session";

const fields = new MsGraphOAuthFieldsBuilder();

// ---------------------------------------------------------------------------
// Credential field shape
// ---------------------------------------------------------------------------

type PublicConfig = Readonly<{
  clientId: string;
  tenantId: string;
  scopePreset: MailScopePreset;
  customScopes: string;
}>;

type SecretConfig = Readonly<{
  clientSecret: string;
}>;

// Material from the OAuth callback carries the refresh + access tokens.
// Host stores OAuth2 material in snake_case (matching the OAuth2 spec field names),
// not camelCase — see packages/host/src/domain/credentials/OAuth2ConnectServiceFactory.ts.
type OAuthMaterial = SecretConfig & Readonly<{ refresh_token?: string; access_token?: string }>;

// ---------------------------------------------------------------------------
// Credential type definition
// ---------------------------------------------------------------------------

export const MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID = "msgraph-mail-oauth";

async function createSession(args: CredentialSessionFactoryArgs<PublicConfig, SecretConfig>): Promise<MsGraphSession> {
  const material = args.material as OAuthMaterial;
  const scopes = resolveMailScopes(
    (args.publicConfig.scopePreset as MailScopePreset | undefined) ?? "read-mail",
    args.publicConfig.customScopes ?? "",
  );
  return createMsGraphOAuthSession({
    clientId: args.publicConfig.clientId,
    tenantId: args.publicConfig.tenantId ?? "common",
    clientSecret: args.material.clientSecret,
    scopes,
    refreshToken: material.refresh_token ?? "",
  });
}

export const msGraphMailOAuthCredentialType: AnyCredentialType = {
  definition: {
    typeId: MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID,
    displayName: "Microsoft Graph Mail (OAuth)",
    description: "OAuth credentials for Microsoft 365 Outlook/mail.",
    publicFields: fields.buildPublicFields({
      scopePresetPlaceholder: "read-mail",
      scopePresetHelpText:
        "Pick the permission set: read-mail, read-write-mail, send-mail, or mail-all. Use customScopes to add extras.",
    }),
    secretFields: fields.buildSecretFields(),
    supportedSourceKinds: ["db", "env", "code"],
    auth: {
      kind: "oauth2",
      providerId: "microsoft",
      authorizeUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      scopes: MAIL_SCOPE_PRESETS["read-mail"] as ReadonlyArray<string>,
      scopesFromPublicConfig: {
        presetFieldKey: "scopePreset",
        presetScopes: MAIL_SCOPE_PRESETS as unknown as Readonly<Record<string, ReadonlyArray<string>>>,
        customScopesFieldKey: "customScopes",
      },
    },
  },

  async createSession(args) {
    return createSession(args as unknown as CredentialSessionFactoryArgs<PublicConfig, SecretConfig>);
  },

  async test(args) {
    try {
      const session = await createSession(args as unknown as CredentialSessionFactoryArgs<PublicConfig, SecretConfig>);
      const client = createGraphClient(session);
      await client.api("/me").select("id,displayName").get();
      return { status: "healthy" as const };
    } catch (err) {
      return {
        status: "failing" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

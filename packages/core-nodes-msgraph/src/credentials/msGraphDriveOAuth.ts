import type { AnyCredentialType, CredentialSessionFactoryArgs } from "@codemation/core";
import { MsGraphOAuthFieldsBuilder } from "./MsGraphOAuthFieldsBuilder";
import { DRIVE_SCOPE_PRESETS, resolveDriveScopes, type DriveScopePreset } from "./scopes";
import { createGraphClient, createMsGraphOAuthSession, type MsGraphSession } from "./session";

const fields = new MsGraphOAuthFieldsBuilder();

// ---------------------------------------------------------------------------
// Credential field shape
// ---------------------------------------------------------------------------

type PublicConfig = Readonly<{
  clientId: string;
  tenantId: string;
  scopePreset: DriveScopePreset;
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

export const MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID = "msgraph-drive-oauth";

async function createSession(args: CredentialSessionFactoryArgs<PublicConfig, SecretConfig>): Promise<MsGraphSession> {
  const material = args.material as OAuthMaterial;
  const scopes = resolveDriveScopes(
    (args.publicConfig.scopePreset as DriveScopePreset | undefined) ?? "files-readwrite",
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

export const msGraphDriveOAuthCredentialType: AnyCredentialType = {
  definition: {
    typeId: MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID,
    displayName: "Microsoft Graph Drive (OAuth)",
    description: "OAuth credentials for OneDrive, SharePoint files, and Excel workbooks.",
    publicFields: fields.buildPublicFields({
      scopePresetPlaceholder: "files-readwrite",
      scopePresetHelpText:
        "Pick the permission set: files-read, files-readwrite, or drive-all. Use customScopes to add extras.",
    }),
    secretFields: fields.buildSecretFields(),
    supportedSourceKinds: ["db", "env", "code"],
    auth: {
      kind: "oauth2",
      providerId: "microsoft",
      authorizeUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      scopes: DRIVE_SCOPE_PRESETS["files-readwrite"] as ReadonlyArray<string>,
      scopesFromPublicConfig: {
        presetFieldKey: "scopePreset",
        presetScopes: DRIVE_SCOPE_PRESETS as unknown as Readonly<Record<string, ReadonlyArray<string>>>,
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

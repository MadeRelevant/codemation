import type { AnyCredentialType, CredentialSessionFactoryArgs } from "@codemation/core";
import { SCOPE_PRESETS, resolveScopes, type ScopePreset } from "./scopes";
import { createGraphClient, type MsGraphSession } from "./session";

// ---------------------------------------------------------------------------
// Credential field shape
// ---------------------------------------------------------------------------

type PublicConfig = Readonly<{
  clientId: string;
  tenantId: string;
  scopePreset: ScopePreset;
  customScopes: string;
}>;

type SecretConfig = Readonly<{
  clientSecret: string;
}>;

// Material from the OAuth callback carries the refresh token.
type OAuthMaterial = SecretConfig & Readonly<{ refreshToken?: string; accessToken?: string }>;

// ---------------------------------------------------------------------------
// Credential type definition
// ---------------------------------------------------------------------------

export const MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID = "msgraph-oauth";

async function createSession(args: CredentialSessionFactoryArgs<PublicConfig, SecretConfig>): Promise<MsGraphSession> {
  const material = args.material as OAuthMaterial;
  const scopes = resolveScopes(
    (args.publicConfig.scopePreset as ScopePreset | undefined) ?? "read-mail",
    args.publicConfig.customScopes ?? "",
  );
  return createMsGraphSession({
    clientId: args.publicConfig.clientId,
    tenantId: args.publicConfig.tenantId ?? "common",
    clientSecret: args.material.clientSecret,
    scopes,
    refreshToken: material.refreshToken ?? material.accessToken ?? "",
  });
}

export const msGraphOAuthCredentialType: AnyCredentialType = {
  definition: {
    typeId: MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID,
    displayName: "Microsoft Graph OAuth",
    description:
      "OAuth2 credentials for a Microsoft 365 account. Supports mail, files, calendar, and other Graph API surfaces.",
    publicFields: [
      {
        key: "clientId",
        label: "Client ID",
        type: "string",
        required: true,
        order: 0,
        envVarName: "CODEMATION_MSGRAPH_CLIENT_ID",
      },
      {
        key: "tenantId",
        label: "Tenant ID",
        type: "string",
        placeholder: "common",
        helpText: 'Use "common" for multi-tenant apps, or your Azure AD tenant GUID for single-tenant.',
        order: 1,
        envVarName: "CODEMATION_MSGRAPH_TENANT_ID",
      },
      {
        key: "scopePreset",
        label: "Scope preset",
        type: "string",
        placeholder: "read-mail",
        helpText:
          "Pick the permission set: read-mail, read-write-mail, send-mail, files-read, or files-readwrite. Use customScopes to add extras.",
        order: 2,
        visibility: "advanced" as const,
      },
      {
        key: "customScopes",
        label: "Additional scopes",
        type: "textarea",
        placeholder: "Calendars.Read Teams.ReadBasic.All",
        helpText: "Space-separated extra Graph scopes appended to the preset. Optional.",
        order: 3,
        visibility: "advanced" as const,
      },
    ],
    secretFields: [
      {
        key: "clientSecret",
        label: "Client secret",
        type: "password",
        required: true,
        order: 4,
        envVarName: "CODEMATION_MSGRAPH_CLIENT_SECRET",
      },
    ],
    supportedSourceKinds: ["db", "env", "code"],
    auth: {
      kind: "oauth2",
      providerId: "microsoft",
      scopes: SCOPE_PRESETS["read-mail"] as ReadonlyArray<string>,
      scopesFromPublicConfig: {
        presetFieldKey: "scopePreset",
        presetScopes: SCOPE_PRESETS as unknown as Readonly<Record<string, ReadonlyArray<string>>>,
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

// ---------------------------------------------------------------------------
// Internal session factory
// ---------------------------------------------------------------------------

async function createMsGraphSession(args: {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  scopes: ReadonlyArray<string>;
  refreshToken: string;
}): Promise<MsGraphSession> {
  // Lazy import to avoid loading MSAL at module-load time.
  const { ConfidentialClientApplication } = await import("@azure/msal-node");

  const msal = new ConfidentialClientApplication({
    auth: {
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      authority: `https://login.microsoftonline.com/${args.tenantId}`,
    },
  });

  const mutableScopes = [...args.scopes];
  let cachedAccessToken = "";
  let tokenExpiresAt = 0;

  async function refresh(): Promise<string> {
    if (cachedAccessToken && Date.now() < tokenExpiresAt - 30_000) {
      return cachedAccessToken;
    }
    const result = await msal.acquireTokenByRefreshToken({
      refreshToken: args.refreshToken,
      scopes: mutableScopes,
    });
    if (!result?.accessToken) {
      throw new Error("Microsoft Graph: token refresh returned no access token");
    }
    cachedAccessToken = result.accessToken;
    tokenExpiresAt = result.expiresOn?.getTime() ?? Date.now() + 3600_000;
    return cachedAccessToken;
  }

  // Eagerly fetch a token so callers get an early error if credentials are wrong.
  if (args.refreshToken) {
    cachedAccessToken = await refresh();
  }

  return { accessToken: cachedAccessToken, refresh };
}

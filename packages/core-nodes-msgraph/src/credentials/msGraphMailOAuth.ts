import { defineCredential } from "@codemation/core";
import { MAIL_SCOPE_PRESETS, resolveMailScopes, type MailScopePreset } from "./scopes";
import { createMsGraphOAuthSession } from "./session";
import type { MsGraphSession } from "./session";
import {
  MSGRAPH_PUBLIC_FIELDS_BASE,
  MSGRAPH_SECRET_FIELDS_BASE,
  MSGRAPH_CUSTOM_SCOPES_FIELD,
  testMsGraphSession,
  type MsGraphPublicConfig,
  type MsGraphMaterial,
} from "./msGraphOAuthFields";

export const msGraphMailOAuthCredentialType = defineCredential({
  key: "msgraph-mail-oauth",
  label: "Microsoft Graph Mail (OAuth)",
  description: "OAuth credentials for Microsoft 365 Outlook/mail.",
  public: {
    ...MSGRAPH_PUBLIC_FIELDS_BASE,
    scopePreset: {
      label: "Scope preset",
      type: "string" as const,
      placeholder: "read-mail",
      helpText:
        "Pick the permission set: read-mail, read-write-mail, send-mail, or mail-all. Use customScopes to add extras.",
      order: 2,
      visibility: "advanced" as const,
    },
    customScopes: MSGRAPH_CUSTOM_SCOPES_FIELD,
  },
  secret: { ...MSGRAPH_SECRET_FIELDS_BASE },
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
  async createSession({ publicConfig, material }) {
    // Cast to known shapes — the field map descriptors produce opaque inference types.
    // The host injects refresh_token and access_token into material at runtime (from OAuth flow).
    const pub = publicConfig as unknown as MsGraphPublicConfig;
    const mat = material as unknown as MsGraphMaterial;
    const scopes = resolveMailScopes(
      (pub.scopePreset as MailScopePreset | undefined) ?? "read-mail",
      pub.customScopes ?? "",
    );
    return createMsGraphOAuthSession({
      clientId: pub.clientId,
      tenantId: pub.tenantId ?? "common",
      clientSecret: mat.clientSecret,
      scopes,
      refreshToken: mat.refresh_token ?? "",
    });
  },
  async test({ publicConfig, material }) {
    // Cast to known shapes — the field map descriptors produce opaque inference types.
    const pub = publicConfig as unknown as MsGraphPublicConfig;
    const mat = material as unknown as MsGraphMaterial;
    const scopes = resolveMailScopes(
      (pub.scopePreset as MailScopePreset | undefined) ?? "read-mail",
      pub.customScopes ?? "",
    );
    const session = (await createMsGraphOAuthSession({
      clientId: pub.clientId,
      tenantId: pub.tenantId ?? "common",
      clientSecret: mat.clientSecret,
      scopes,
      refreshToken: mat.refresh_token ?? "",
    })) as MsGraphSession;
    return testMsGraphSession(session);
  },
});

export const MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID = msGraphMailOAuthCredentialType.key;

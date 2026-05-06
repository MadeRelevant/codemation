import { defineCredential } from "@codemation/core";
import { DRIVE_SCOPE_PRESETS, resolveDriveScopes, type DriveScopePreset } from "./scopes";
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

export const msGraphDriveOAuthCredentialType = defineCredential({
  key: "msgraph-drive-oauth",
  label: "Microsoft Graph Drive (OAuth)",
  description: "OAuth credentials for OneDrive, SharePoint files, and Excel workbooks.",
  public: {
    ...MSGRAPH_PUBLIC_FIELDS_BASE,
    scopePreset: {
      label: "Scope preset",
      type: "string" as const,
      placeholder: "files-readwrite",
      helpText: "Pick the permission set: files-read, files-readwrite, or drive-all. Use customScopes to add extras.",
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
    scopes: DRIVE_SCOPE_PRESETS["files-readwrite"] as ReadonlyArray<string>,
    scopesFromPublicConfig: {
      presetFieldKey: "scopePreset",
      presetScopes: DRIVE_SCOPE_PRESETS as unknown as Readonly<Record<string, ReadonlyArray<string>>>,
      customScopesFieldKey: "customScopes",
    },
  },
  async createSession({ publicConfig, material }) {
    // Cast to known shapes — the field map descriptors produce opaque inference types.
    // The host injects refresh_token and access_token into material at runtime (from OAuth flow).
    const pub = publicConfig as unknown as MsGraphPublicConfig;
    const mat = material as unknown as MsGraphMaterial;
    const scopes = resolveDriveScopes(
      (pub.scopePreset as DriveScopePreset | undefined) ?? "files-readwrite",
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
    const scopes = resolveDriveScopes(
      (pub.scopePreset as DriveScopePreset | undefined) ?? "files-readwrite",
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

export const MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID = msGraphDriveOAuthCredentialType.key;

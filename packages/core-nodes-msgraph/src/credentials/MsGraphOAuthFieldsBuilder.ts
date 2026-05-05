import type { CredentialFieldSchema } from "@codemation/core";

/**
 * Builds the public + secret credential field schemas shared by both
 * msgraph-mail-oauth and msgraph-drive-oauth credential types.
 *
 * The two credential types differ only in their scope preset choices and
 * help text. Everything else (clientId, tenantId, customScopes, clientSecret,
 * envVarName mappings) is identical.
 */
export class MsGraphOAuthFieldsBuilder {
  buildPublicFields(args: {
    scopePresetPlaceholder: string;
    scopePresetHelpText: string;
  }): ReadonlyArray<CredentialFieldSchema> {
    return [
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
        required: true,
        placeholder: "common",
        helpText: 'Use "common" for multi-tenant apps, or your Azure AD tenant GUID for single-tenant.',
        order: 1,
        envVarName: "CODEMATION_MSGRAPH_TENANT_ID",
      },
      {
        key: "scopePreset",
        label: "Scope preset",
        type: "string",
        placeholder: args.scopePresetPlaceholder,
        helpText: args.scopePresetHelpText,
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
    ];
  }

  buildSecretFields(): ReadonlyArray<CredentialFieldSchema> {
    return [
      {
        key: "clientSecret",
        label: "Client secret",
        type: "password",
        required: true,
        order: 4,
        envVarName: "CODEMATION_MSGRAPH_CLIENT_SECRET",
      },
    ];
  }
}

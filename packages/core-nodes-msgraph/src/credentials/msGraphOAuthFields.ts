/**
 * Shared field definitions and helpers for MS Graph OAuth credentials.
 * Both msGraphDriveOAuth and msGraphMailOAuth reuse these to stay DRY.
 */

import { createGraphClient } from "./session";
import type { MsGraphSession } from "./session";

/** Common public fields shared by both Drive and Mail credential types. */
export const MSGRAPH_PUBLIC_FIELDS_BASE = {
  clientId: {
    label: "Client ID",
    type: "string" as const,
    required: true as const,
    order: 0,
    envVarName: "CODEMATION_MSGRAPH_CLIENT_ID",
  },
  tenantId: {
    label: "Tenant ID",
    type: "string" as const,
    required: true as const,
    placeholder: "common",
    helpText: 'Use "common" for multi-tenant apps, or your Azure AD tenant GUID for single-tenant.',
    order: 1,
    envVarName: "CODEMATION_MSGRAPH_TENANT_ID",
  },
} as const;

/** Common additional-scopes field descriptor (no key — caller adds it as needed). */
export const MSGRAPH_CUSTOM_SCOPES_FIELD = {
  label: "Additional scopes",
  type: "textarea" as const,
  placeholder: "Calendars.Read Teams.ReadBasic.All",
  helpText: "Space-separated extra Graph scopes appended to the preset. Optional.",
  order: 3,
  visibility: "advanced" as const,
} as const;

/** Common secret fields shared by both Drive and Mail credential types. */
export const MSGRAPH_SECRET_FIELDS_BASE = {
  clientSecret: {
    label: "Client secret",
    type: "password" as const,
    required: true as const,
    order: 4,
    envVarName: "CODEMATION_MSGRAPH_CLIENT_SECRET",
  },
} as const;

/**
 * Shared health-check implementation for MS Graph credential types.
 * Calls GET /me to verify the session produces a valid access token.
 */
export async function testMsGraphSession(
  session: MsGraphSession,
): Promise<{ status: "healthy" | "failing"; message?: string }> {
  try {
    const client = createGraphClient(session);
    await client.api("/me").select("id,displayName").get();
    return { status: "healthy" as const };
  } catch (err) {
    return {
      status: "failing" as const,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Type for the runtime public config shape for both MS Graph credential types. */
export type MsGraphPublicConfig = {
  clientId: string;
  tenantId: string;
  scopePreset?: string;
  customScopes?: string;
};

/** Type for the runtime material shape for both MS Graph credential types. */
export type MsGraphMaterial = {
  clientSecret: string;
  refresh_token?: string;
  access_token?: string;
};

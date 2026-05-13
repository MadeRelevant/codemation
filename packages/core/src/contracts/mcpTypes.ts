export type McpServerTransport = "http";
// "stdio" is a self-host-only escape hatch (CODEMATION_ALLOW_STDIO_MCP=true); not typed here for managed.

export interface McpServerDeclaration {
  /** Globally unique slug, e.g. "gmail". Workflow authors reference this. */
  id: string;
  displayName: string;
  description: string;
  transport: McpServerTransport;
  url: string;
  /**
   * "oauth2-via-broker" — credential is an OAuth2 token obtained via the CP broker.
   * "bearer"            — credential is a static Bearer token.
   * "basic"             — credential is username/password.
   * "none"              — no credential required.
   */
  credentialKind: "oauth2-via-broker" | "bearer" | "basic" | "none";
  /** Required when credentialKind = "oauth2-via-broker". References an OAuthApp.key on the CP. */
  oauthAppKey?: string;
  /** Required when credentialKind != "none". References an installed credential type id. */
  credentialTypeId?: string;
  /**
   * Documentation only in MVP. The bind-time validator in Story 11 checks
   * requiredScopes ⊆ CredentialInstance.scopesGranted.
   */
  requiredScopes?: string[];
  /** Non-secret static headers merged onto every MCP request. */
  staticHeaders?: Record<string, string>;
  /**
   * Overrides for tool descriptions advertised by the MCP server.
   * Applied by the connection pool (Story 9) after tools/list.
   * Key: exact tool name as returned by the server.
   */
  toolDescriptionOverrides?: Record<string, string>;
}

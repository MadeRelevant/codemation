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
   * Credential types accepted by this MCP server, matching CredentialRequirement.acceptedTypes.
   * Absent or empty means no credential is required.
   */
  acceptedCredentialTypes?: ReadonlyArray<string>;
  /**
   * Documentation only in MVP. The bind-time validator checks
   * requiredScopes ⊆ CredentialInstance.scopesGranted.
   */
  requiredScopes?: string[];
  /** Non-secret static headers merged onto every MCP request. */
  staticHeaders?: Record<string, string>;
  /**
   * Overrides for tool descriptions advertised by the MCP server.
   * Applied by the connection pool after tools/list.
   * Key: exact tool name as returned by the server.
   */
  toolDescriptionOverrides?: Record<string, string>;
}

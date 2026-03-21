/**
 * Consumer-declared authentication profile for the hosted UI + HTTP API.
 * NextAuth / Auth.js wires concrete providers from this configuration plus environment secrets.
 */
export type CodemationAuthKind = "local" | "oauth" | "oidc";

export interface CodemationAuthOAuthProviderConfig {
  readonly provider: "google" | "github" | "microsoft-entra-id";
  readonly clientIdEnv: string;
  readonly clientSecretEnv: string;
  /** Microsoft Entra ID tenant; environment variable name whose value is the tenant ID. */
  readonly tenantIdEnv?: string;
}

export interface CodemationAuthOidcProviderConfig {
  readonly id: string;
  readonly issuer: string;
  readonly clientIdEnv: string;
  readonly clientSecretEnv: string;
}

export interface CodemationAuthConfig {
  readonly kind: CodemationAuthKind;
  /**
   * When true and NODE_ENV is not production, the API accepts requests without a real session
   * (synthetic principal only — never honored in production).
   */
  readonly allowUnauthenticatedInDevelopment?: boolean;
  readonly oauth?: ReadonlyArray<CodemationAuthOAuthProviderConfig>;
  readonly oidc?: ReadonlyArray<CodemationAuthOidcProviderConfig>;
}

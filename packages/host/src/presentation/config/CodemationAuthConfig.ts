import type { BetterAuthOptions } from "better-auth";

/**
 * Consumer-declared authentication profile for the hosted UI + HTTP API.
 * Social provider ids intentionally match Better Auth's provider ids so config stays 1:1 with the auth runtime.
 */
export type CodemationAuthKind = "local" | "oauth" | "oidc";

export type CodemationAuthOAuthProviderId = Extract<
  keyof NonNullable<BetterAuthOptions["socialProviders"]>,
  "github" | "google" | "microsoft"
>;

export interface CodemationAuthOAuthProviderConfig {
  readonly provider: CodemationAuthOAuthProviderId;
  readonly clientIdEnv: string;
  readonly clientSecretEnv: string;
  /** Microsoft tenant; environment variable name whose value is the tenant ID. */
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

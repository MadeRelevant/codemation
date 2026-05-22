/**
 * Four-concept model for credentials (see docs/design/credentials-oauth-unification.md):
 *   1. CredentialType — schema for stored material (e.g. "oauth.google.gmail").
 *   2. Credential slot requirement — which types a node or MCP server accepts.
 *   3. CredentialInstance — a stored, usable token row in the host's credential store.
 *   4. OAuthFlowExecutor (this file) — the only concept that differs between deployment
 *      modes. DI selects one implementation at boot; the rest of the system programs
 *      against this interface alone.
 */

export interface OAuthFlowStartArgs {
  readonly typeId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly redirectUri: string;
  readonly instanceId?: string;
}

export interface OAuthFlowStartResult {
  readonly consentUrl: string;
  readonly stateToken: string;
}

export interface OAuthFlowCallbackArgs {
  readonly stateToken: string;
  readonly code: string;
}

export interface OAuthMaterial {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: string;
  readonly grantedScopes: ReadonlyArray<string>;
}

export interface OAuthFlowExecutor {
  start(args: OAuthFlowStartArgs): Promise<OAuthFlowStartResult>;
  /**
   * Returns the instanceId associated with a pending stateToken without consuming it.
   * Used by callback routes to identify the target instance before calling completeCallback.
   * Returns undefined when the stateToken is unknown or already consumed.
   */
  lookupInstanceId(stateToken: string): string | undefined;
  completeCallback(args: OAuthFlowCallbackArgs): Promise<OAuthMaterial>;
  refresh(args: { typeId: string; instanceId: string; material: OAuthMaterial }): Promise<OAuthMaterial>;
}

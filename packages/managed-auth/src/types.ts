/**
 * A successfully verified CP-signed JWT principal.
 * `userId` maps to the JWT `sub` claim; `workspaceId` maps to `aud`.
 */
export interface VerifiedManagedPrincipal {
  readonly userId: string;
  readonly workspaceId: string;
}

export type JwtVerificationFailureReason =
  | "missing-kid"
  | "unknown-kid"
  | "bad-signature"
  | "wrong-iss"
  | "wrong-aud"
  | "expired"
  | "not-yet-valid"
  | "malformed";

/** Structured failure returned instead of throwing, so callers can map to HTTP status codes cleanly. */
export interface JwtVerificationFailure {
  readonly failure: JwtVerificationFailureReason;
  readonly message: string;
}

export interface JwksCacheConfig {
  /** URL to the JWKS endpoint (e.g. https://cp.example.com/.well-known/jwks.json). */
  readonly jwksUrl: string;
  /** TTL in milliseconds before the cache is considered stale. Defaults to 15 minutes. */
  readonly ttlMs?: number;
  /** Jitter window in milliseconds applied to TTL to avoid stampedes. Defaults to 60 seconds. */
  readonly jitterMs?: number;
}

export interface ManagedJwtVerifierConfig {
  /** Expected value of the JWT `iss` claim — must exactly match. */
  readonly expectedIssuer: string;
  /** Expected `aud` claim — must exactly match the workspace ID. */
  readonly expectedAudience: string;
  readonly jwksCache: JwksCacheConfig;
}

/** Minimal fetch-compatible function type for injection / testing. */
export type FetchFn = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Minimal clock interface for injection / testing. */
export interface Clock {
  now(): number;
}

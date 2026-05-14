import { decodeProtectedHeader, jwtVerify, errors as joseErrors } from "jose";
import type { JwtVerificationFailure, ManagedJwtVerifierConfig, VerifiedManagedPrincipal } from "./types.js";
import type { JwksCache } from "./JwksCache.js";

type VerifyResult = VerifiedManagedPrincipal | JwtVerificationFailure;

/**
 * Validates CP-signed EdDSA JWT bearers.
 *
 * Checks: signature, `iss` matches expected, `aud` matches expected workspaceId,
 * `exp`, `nbf`. Returns a `VerifiedManagedPrincipal` or a structured `JwtVerificationFailure`.
 *
 * Hono-independent — no web framework coupling.
 */
export class ManagedJwtVerifier {
  constructor(
    private readonly config: ManagedJwtVerifierConfig,
    private readonly jwksCache: JwksCache,
  ) {}

  async verify(token: string): Promise<VerifyResult> {
    // Decode header to get kid before verifying signature
    let kid: string | undefined;
    try {
      const header = decodeProtectedHeader(token);
      kid = typeof header.kid === "string" ? header.kid : undefined;
    } catch {
      return { failure: "malformed", message: "Unable to decode JWT header." };
    }

    if (!kid) {
      return { failure: "missing-kid", message: "JWT header is missing the `kid` field." };
    }

    const key = await this.jwksCache.getKey(kid);
    if (key === null) {
      return { failure: "unknown-kid", message: `No key found for kid "${kid}" after JWKS refresh.` };
    }

    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: this.config.expectedIssuer,
        audience: this.config.expectedAudience,
        algorithms: ["EdDSA"],
      });

      const sub = payload.sub;
      const aud = payload.aud;
      const workspaceId = Array.isArray(aud) ? aud[0] : aud;

      if (!sub || typeof sub !== "string") {
        return { failure: "malformed", message: "JWT is missing the `sub` claim." };
      }
      if (!workspaceId || typeof workspaceId !== "string") {
        return { failure: "wrong-aud", message: "JWT `aud` claim is absent or not a string." };
      }

      return { userId: sub, workspaceId };
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        return { failure: "expired", message: "JWT has expired." };
      }
      if (error instanceof joseErrors.JWTClaimValidationFailed) {
        const claim = error.claim;
        if (claim === "iss") {
          return { failure: "wrong-iss", message: "JWT `iss` claim does not match expected issuer." };
        }
        if (claim === "aud") {
          return { failure: "wrong-aud", message: "JWT `aud` claim does not match expected audience." };
        }
        if (claim === "nbf") {
          return { failure: "not-yet-valid", message: "JWT is not yet valid (nbf check failed)." };
        }
        return { failure: "malformed", message: `JWT claim validation failed: ${error.message}` };
      }
      if (error instanceof joseErrors.JWSSignatureVerificationFailed || error instanceof joseErrors.JWSInvalid) {
        return { failure: "bad-signature", message: "JWT signature verification failed." };
      }
      return { failure: "malformed", message: "JWT verification failed." };
    }
  }
}

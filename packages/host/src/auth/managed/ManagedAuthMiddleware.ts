import { injectable } from "@codemation/core";
import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import type { SessionVerifier } from "../../application/auth/SessionVerifier";
import type { ManagedJwtVerifier } from "@codemation/managed-auth";

/**
 * Session verifier for `auth.kind: "managed"`.
 *
 * Reads `Authorization: Bearer <token>`, delegates to `ManagedJwtVerifier`,
 * and maps the verified principal to `AuthenticatedPrincipal`.
 *
 * Returns null (unauthorized) when the header is missing or the token fails
 * verification — the API middleware converts this to 401.
 */
@injectable()
export class ManagedAuthMiddleware implements SessionVerifier {
  constructor(private readonly verifier: ManagedJwtVerifier) {}

  async verify(request: Request): Promise<AuthenticatedPrincipal | null> {
    const authorization = request.headers.get("authorization");
    if (!authorization) {
      return null;
    }

    const token = this.extractBearerToken(authorization);
    if (!token) {
      return null;
    }

    const result = await this.verifier.verify(token);
    if ("failure" in result) {
      return null;
    }

    return {
      id: result.userId,
      email: null,
      name: null,
      source: "managed-jwt",
      workspaceId: result.workspaceId,
    };
  }

  private extractBearerToken(authorization: string): string | null {
    const lower = authorization.trimStart();
    if (!lower.toLowerCase().startsWith("bearer ")) {
      return null;
    }
    const token = authorization.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}

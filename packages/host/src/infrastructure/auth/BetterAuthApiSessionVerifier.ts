import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import type { SessionVerifier } from "../../application/auth/SessionVerifier";
import { CodemationBetterAuthRuntime } from "./CodemationBetterAuthRuntime";
import type { PrismaUserAccountSessionEligibilityChecker } from "./PrismaUserAccountSessionEligibilityChecker";

/**
 * Resolves the current principal via Better Auth's {@code getSession} server API (DB session cookies).
 */
export class BetterAuthApiSessionVerifier implements SessionVerifier {
  constructor(
    private readonly runtime: CodemationBetterAuthRuntime,
    private readonly sessionEligibility: PrismaUserAccountSessionEligibilityChecker | undefined,
  ) {}

  async verify(request: Request): Promise<AuthenticatedPrincipal | null> {
    const auth = this.runtime.tryGetAuth();
    if (!auth) {
      return null;
    }
    try {
      const data = await auth.api.getSession({ headers: request.headers });
      if (!data?.user) {
        return null;
      }
      const userId = data.user.id;
      if (this.sessionEligibility && !(await this.sessionEligibility.mayCreateOrResumeBetterAuthSession(userId))) {
        return null;
      }
      return {
        id: userId,
        email: typeof data.user.email === "string" ? data.user.email : null,
        name: typeof data.user.name === "string" ? data.user.name : null,
      };
    } catch {
      return null;
    }
  }
}

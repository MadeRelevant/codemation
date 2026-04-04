import type { UserAccountSessionPolicy } from "../../domain/users/UserAccountSessionPolicy";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

/**
 * Loads {@code User.accountStatus} and applies {@link UserAccountSessionPolicy}
 * for Better Auth hooks and API session verification.
 */
export class PrismaUserAccountSessionEligibilityChecker {
  constructor(
    private readonly prisma: PrismaDatabaseClient,
    private readonly policy: UserAccountSessionPolicy,
  ) {}

  async mayCreateOrResumeBetterAuthSession(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accountStatus: true },
    });
    if (!row) {
      return false;
    }
    return this.policy.allowsBetterAuthCookieSession(row.accountStatus);
  }
}

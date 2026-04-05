/**
 * Codemation-owned rules for who may authenticate via Better Auth (cookies/OAuth)
 * versus who is still in the invite-only directory state.
 *
 * Better Auth owns protocol mechanics; this policy owns {@code accountStatus} semantics.
 */
export class UserAccountSessionPolicy {
  /**
   * Only {@code active} users may obtain or resume a Better Auth DB session
   * (email/password, OAuth, OIDC — any path that ends in a session row).
   */
  allowsBetterAuthCookieSession(accountStatus: string): boolean {
    return accountStatus === "active";
  }

  /**
   * Invite verify/accept/regenerate apply only while the directory row is still {@code invited}.
   */
  isEligibleForInviteTokenFlow(accountStatus: string): boolean {
    return accountStatus === "invited";
  }
}

/**
 * Thrown when the control-plane broker returns HTTP 410 (invalid_grant).
 * The refresh token is dead — user revoked, token rotated away, etc.
 * The credential cannot be auto-recovered; the user must reconnect via the Connect flow.
 */
export class BrokerRefreshInvalidGrantError extends Error {
  constructor(readonly credentialInstanceId: string) {
    super(
      `Credential ${credentialInstanceId}: refresh token is invalid or revoked (invalid_grant). Reconnect required.`,
    );
    this.name = "BrokerRefreshInvalidGrantError";
  }
}

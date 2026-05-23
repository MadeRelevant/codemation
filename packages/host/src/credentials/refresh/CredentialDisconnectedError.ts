/**
 * Thrown when the credential's refresh token is dead (user revoked the grant,
 * or the token was rotated away). The installation cannot auto-recover; the user
 * must reconnect via the broker Connect flow.
 */
export class CredentialDisconnectedError extends Error {
  constructor(readonly credentialInstanceId: string) {
    super(`Credential ${credentialInstanceId}: refresh token is invalid or revoked. Reconnect via the Connect flow.`);
    this.name = "CredentialDisconnectedError";
  }
}

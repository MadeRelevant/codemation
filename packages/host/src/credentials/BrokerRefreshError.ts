/**
 * Thrown when the broker returns an unexpected non-success HTTP status during refresh.
 */
export class BrokerRefreshError extends Error {
  constructor(
    readonly credentialInstanceId: string,
    readonly status: number,
  ) {
    super(`Credential ${credentialInstanceId}: broker refresh failed with status ${status}.`);
    this.name = "BrokerRefreshError";
  }
}

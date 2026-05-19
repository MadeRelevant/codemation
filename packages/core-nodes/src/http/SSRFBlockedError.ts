/**
 * Thrown when an HTTP request target resolves to a private, link-local, or
 * loopback address and `allowPrivateNetworkTargets` is not set.
 */
export class SSRFBlockedError extends Error {
  readonly resolvedIp: string;

  constructor(host: string, resolvedIp: string) {
    super(
      `SSRF protection blocked request to host "${host}" — resolved IP ${resolvedIp} is a private, ` +
        `link-local, or loopback address. Set allowPrivateNetworkTargets: true to allow trusted internal targets.`,
    );
    this.name = "SSRFBlockedError";
    this.resolvedIp = resolvedIp;
  }
}

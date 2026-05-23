import dns from "node:dns/promises";
import { SSRFBlockedError } from "./SSRFBlockedError";

export { SSRFBlockedError } from "./SSRFBlockedError";

/** Emitted once per process when NODE_ENV=production and no allowedOutboundHosts is set. */
let _productionNoAllowlistWarned = false;

/**
 * Guards HTTP requests against Server-Side Request Forgery (SSRF) by
 * DNS-resolving the target host and rejecting private/link-local/loopback
 * addresses.
 *
 * Blocked ranges:
 * - RFC-1918: 10/8, 172.16/12, 192.168/16
 * - Link-local: 169.254/16
 * - Loopback: 127/8, ::1
 *
 * When `allowedOutboundHosts` is set, every resolved DNS target must match
 * at least one entry in the list (exact hostname or `*.example.com` wildcard).
 * When unset, existing behaviour applies: private ranges blocked, public allowed.
 *
 * Call {@link check} before making any outbound HTTP request.
 * Pass `allowPrivate: true` to bypass the private-network guard for trusted workflows
 * (allowedOutboundHosts allowlist is still applied when set).
 */
export class SsrfGuard {
  constructor(private readonly allowedOutboundHosts?: ReadonlyArray<string>) {
    if (
      // eslint-disable-next-line no-restricted-properties
      process.env.NODE_ENV === "production" &&
      (allowedOutboundHosts == null || allowedOutboundHosts.length === 0) &&
      !_productionNoAllowlistWarned
    ) {
      _productionNoAllowlistWarned = true;
      console.warn(
        "[SsrfGuard] WARNING: NODE_ENV=production but no allowedOutboundHosts is configured for HttpRequest. " +
          "All public destinations are permitted. Set allowedOutboundHosts to restrict outbound traffic.",
      );
    }
  }

  /**
   * Resolves the host of `url` via DNS and throws {@link SSRFBlockedError}
   * if any resolved address falls in a blocked range, or if the host does not
   * match the operator-configured allowlist (when set).
   *
   * @param url - Fully-qualified URL of the intended request target.
   * @param allowPrivate - When `true`, the private-network check is skipped.
   *   The allowedOutboundHosts check is still applied when set.
   */
  async check(url: string, allowPrivate: boolean): Promise<void> {
    if (allowPrivate && !this.allowedOutboundHosts?.length) return;

    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      // Malformed URL — let the fetch call surface the error.
      return;
    }

    // Check allowedOutboundHosts allowlist first (hostname match, no DNS needed).
    if (this.allowedOutboundHosts?.length) {
      if (!this.isHostAllowed(host)) {
        throw new SSRFBlockedError(host, host);
      }
      // Host is in the allowlist — skip private-network checks (host is trusted).
      return;
    }

    // No allowlist: apply the standard private-network SSRF guard.
    if (allowPrivate) return;

    // Strip IPv6 brackets for the check below.
    const bareHost = host.startsWith("[") ? host.slice(1, -1) : host;

    // If the host is already a bare IP address, check directly without DNS.
    if (this.isPrivateAddress(bareHost)) {
      throw new SSRFBlockedError(host, bareHost);
    }

    let addresses: ReadonlyArray<{ address: string; family: number }>;
    try {
      addresses = (await dns.lookup(host, { all: true })) as ReadonlyArray<{ address: string; family: number }>;
    } catch {
      // DNS failure — let the fetch call surface the real error (ENOTFOUND etc.).
      return;
    }

    for (const { address } of addresses) {
      if (this.isPrivateAddress(address)) {
        throw new SSRFBlockedError(host, address);
      }
    }
  }

  /**
   * Returns true when `host` matches at least one entry in `allowedOutboundHosts`.
   * Supports exact hostnames (`api.example.com`) and wildcard prefixes (`*.example.com`).
   */
  private isHostAllowed(host: string): boolean {
    for (const allowed of this.allowedOutboundHosts ?? []) {
      if (allowed.startsWith("*.")) {
        // Wildcard: *.example.com matches sub.example.com but NOT example.com itself.
        const suffix = allowed.slice(1); // ".example.com"
        if (host.endsWith(suffix) && host.length > suffix.length) return true;
      } else {
        if (host === allowed) return true;
      }
    }
    return false;
  }

  private isPrivateAddress(ip: string): boolean {
    return this.isPrivateIPv4(ip) || this.isPrivateIPv6(ip);
  }

  private isPrivateIPv4(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return false;
    }
    const [a, b] = parts as [number, number, number, number];
    if (a === 127) return true; // loopback 127/8
    if (a === 10) return true; // RFC-1918 10/8
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC-1918 172.16/12
    if (a === 192 && b === 168) return true; // RFC-1918 192.168/16
    if (a === 169 && b === 254) return true; // link-local 169.254/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGN 100.64.0.0/10
    return false;
  }

  private isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true; // loopback
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
    if (lower.startsWith("fe80")) return true; // fe80::/10 link-local
    return false;
  }
}

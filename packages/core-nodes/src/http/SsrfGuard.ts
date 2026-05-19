import dns from "node:dns/promises";
import { SSRFBlockedError } from "./SSRFBlockedError";

export { SSRFBlockedError } from "./SSRFBlockedError";

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
 * Call {@link check} before making any outbound HTTP request.
 * Pass `allowPrivate: true` to bypass the guard for trusted workflows.
 */
export class SsrfGuard {
  /**
   * Resolves the host of `url` via DNS and throws {@link SSRFBlockedError}
   * if any resolved address falls in a blocked range.
   *
   * @param url - Fully-qualified URL of the intended request target.
   * @param allowPrivate - When `true`, the check is skipped entirely.
   */
  async check(url: string, allowPrivate: boolean): Promise<void> {
    if (allowPrivate) return;

    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      // Malformed URL — let the fetch call surface the error.
      return;
    }

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

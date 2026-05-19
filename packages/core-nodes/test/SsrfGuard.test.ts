/**
 * Unit tests for SSRF protection: SsrfGuard and SSRFBlockedError.
 *
 * We avoid real DNS queries by testing the bare-IP path (which never does DNS)
 * and supply the executor with a real SsrfGuard so integration tests are
 * exercised via that path.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { SSRFBlockedError, SsrfGuard } from "../src/http/SsrfGuard";

/** Convenience wrapper: call guard.check on a URL with allowPrivate=false. */
async function check(url: string, allowPrivate = false): Promise<void> {
  return new SsrfGuard().check(url, allowPrivate);
}

describe("SSRFBlockedError", () => {
  test("exposes resolvedIp and correct name", () => {
    const err = new SSRFBlockedError("169.254.169.254", "169.254.169.254");
    assert.ok(err instanceof SSRFBlockedError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, "SSRFBlockedError");
    assert.equal(err.resolvedIp, "169.254.169.254");
    assert.match(err.message, /169\.254\.169\.254/);
    assert.match(err.message, /private|link-local|loopback/i);
  });
});

describe("SsrfGuard.check — bare IP addresses (no DNS)", () => {
  test("throws SSRFBlockedError for 169.254.169.254 (link-local / cloud metadata)", async () => {
    await assert.rejects(() => check("http://169.254.169.254/latest/meta-data/"), SSRFBlockedError);
  });

  test("throws for 127.0.0.1 (loopback)", async () => {
    await assert.rejects(() => check("http://127.0.0.1/path"), SSRFBlockedError);
  });

  test("throws for 127.1.2.3 (loopback 127/8)", async () => {
    await assert.rejects(() => check("http://127.1.2.3/path"), SSRFBlockedError);
  });

  test("throws for 10.0.0.1 (RFC-1918 class A)", async () => {
    await assert.rejects(() => check("http://10.0.0.1/"), SSRFBlockedError);
  });

  test("throws for 172.16.0.1 (RFC-1918 class B lower boundary)", async () => {
    await assert.rejects(() => check("http://172.16.0.1/"), SSRFBlockedError);
  });

  test("throws for 172.31.255.255 (RFC-1918 class B upper boundary)", async () => {
    await assert.rejects(() => check("http://172.31.255.255/"), SSRFBlockedError);
  });

  test("does NOT throw for 172.15.0.1 (just outside RFC-1918 class B)", async () => {
    await assert.doesNotReject(() => check("http://172.15.0.1/"));
  });

  test("throws for 192.168.1.1 (RFC-1918 class C)", async () => {
    await assert.rejects(() => check("http://192.168.1.1/"), SSRFBlockedError);
  });

  test("throws for ::1 (IPv6 loopback)", async () => {
    await assert.rejects(() => check("http://[::1]/path"), SSRFBlockedError);
  });

  test("throws for [fe80::1] (IPv6 link-local)", async () => {
    await assert.rejects(() => check("http://[fe80::1]/"), SSRFBlockedError);
  });

  test("does NOT throw when allowPrivateNetworkTargets is true (opt-in)", async () => {
    await assert.doesNotReject(() => check("http://169.254.169.254/latest/meta-data/", true));
    await assert.doesNotReject(() => check("http://127.0.0.1/", true));
    await assert.doesNotReject(() => check("http://10.0.0.1/", true));
  });

  test("does NOT throw for a public IP (1.1.1.1)", async () => {
    await assert.doesNotReject(() => check("http://1.1.1.1/"));
  });

  // Boundary tests for IPv4 ranges
  test("throws for 10.255.255.255 (RFC-1918 class A upper boundary)", async () => {
    await assert.rejects(() => check("http://10.255.255.255/"), SSRFBlockedError);
  });

  test("throws for 192.168.255.255 (RFC-1918 class C upper boundary)", async () => {
    await assert.rejects(() => check("http://192.168.255.255/"), SSRFBlockedError);
  });

  test("throws for 169.254.0.1 (link-local lower boundary)", async () => {
    await assert.rejects(() => check("http://169.254.0.1/"), SSRFBlockedError);
  });

  test("does NOT throw for 172.32.0.1 (just above RFC-1918 class B)", async () => {
    await assert.doesNotReject(() => check("http://172.32.0.1/"));
  });

  test("throws for [fc00::1] (IPv6 ULA)", async () => {
    await assert.rejects(() => check("http://[fc00::1]/"), SSRFBlockedError);
  });

  test("throws for [fdab::1] (IPv6 ULA)", async () => {
    await assert.rejects(() => check("http://[fdab::1]/"), SSRFBlockedError);
  });
});

describe("SsrfGuard.check — allowedOutboundHosts allowlist", () => {
  test("with allowlist set, request to listed host passes", async () => {
    const guard = new SsrfGuard(["api.example.com"]);
    await assert.doesNotReject(() => guard.check("https://api.example.com/v1/data", false));
  });

  test("with allowlist set, request to unlisted host is rejected with SSRFBlockedError", async () => {
    const guard = new SsrfGuard(["api.example.com"]);
    await assert.rejects(() => guard.check("https://attacker.com/steal", false), SSRFBlockedError);
  });

  test("wildcard *.example.com matches sub.example.com", async () => {
    const guard = new SsrfGuard(["*.example.com"]);
    await assert.doesNotReject(() => guard.check("https://sub.example.com/api", false));
  });

  test("wildcard *.example.com does NOT match example.com itself", async () => {
    const guard = new SsrfGuard(["*.example.com"]);
    // example.com is not sub.example.com — the wildcard requires a subdomain.
    await assert.rejects(() => guard.check("https://example.com/api", false), SSRFBlockedError);
  });

  test("wildcard *.example.com does NOT match attacker.com", async () => {
    const guard = new SsrfGuard(["*.example.com"]);
    await assert.rejects(() => guard.check("https://attacker.com/steal", false), SSRFBlockedError);
  });

  test("without allowlist, request to attacker.com is allowed (back-compat)", async () => {
    const guard = new SsrfGuard();
    // attacker.com resolves to a public IP — should not be blocked by private-net guard.
    // We test with a known public IP directly to avoid DNS in unit tests.
    await assert.doesNotReject(() => guard.check("http://1.1.1.1/", false));
  });

  test("with allowlist set and allowPrivate=true, allowlist still applies", async () => {
    const guard = new SsrfGuard(["api.example.com"]);
    // Even with allowPrivate=true the allowlist check must fire.
    await assert.rejects(() => guard.check("https://attacker.com/steal", true), SSRFBlockedError);
  });
});

describe("HttpRequestExecutor SSRF integration", () => {
  test("buildRequest throws SSRFBlockedError for http://169.254.169.254/x", async () => {
    const { HttpRequestExecutor } = await import("../src/http/HttpRequestExecutor");
    const { HttpBodyBuilder } = await import("../src/http/HttpBodyBuilder");
    const { HttpUrlBuilder } = await import("../src/http/HttpUrlBuilder");

    const stubFetch: typeof globalThis.fetch = async () => {
      throw new Error("fetch must not be called for SSRF-blocked URLs");
    };

    const executor = new HttpRequestExecutor(stubFetch, new HttpBodyBuilder(), new HttpUrlBuilder(), new SsrfGuard());
    const spec = {
      url: "http://169.254.169.254/latest/meta-data/",
      method: "GET",
      ctx: {} as any,
    };

    await assert.rejects(
      () => executor.buildRequest(spec, { json: {} }),
      SSRFBlockedError,
      "HttpRequestExecutor must throw SSRFBlockedError for cloud-metadata URL",
    );
  });

  test("buildRequest throws SSRFBlockedError for http://10.1.2.3/ (RFC-1918)", async () => {
    const { HttpRequestExecutor } = await import("../src/http/HttpRequestExecutor");
    const { HttpBodyBuilder } = await import("../src/http/HttpBodyBuilder");
    const { HttpUrlBuilder } = await import("../src/http/HttpUrlBuilder");

    const stubFetch: typeof globalThis.fetch = async () => {
      throw new Error("fetch must not be called for SSRF-blocked URLs");
    };

    const executor = new HttpRequestExecutor(stubFetch, new HttpBodyBuilder(), new HttpUrlBuilder(), new SsrfGuard());
    await assert.rejects(
      () => executor.buildRequest({ url: "http://10.1.2.3/api", method: "GET", ctx: {} as any }, { json: {} }),
      SSRFBlockedError,
    );
  });

  test("buildRequest succeeds with allowPrivateNetworkTargets=true for 127.0.0.1", async () => {
    const { HttpRequestExecutor } = await import("../src/http/HttpRequestExecutor");
    const { HttpBodyBuilder } = await import("../src/http/HttpBodyBuilder");
    const { HttpUrlBuilder } = await import("../src/http/HttpUrlBuilder");

    // fetch is never called since buildRequest only prepares, doesn't fetch.
    const stubFetch: typeof globalThis.fetch = async () => {
      throw new Error("unexpected fetch call");
    };

    const executor = new HttpRequestExecutor(stubFetch, new HttpBodyBuilder(), new HttpUrlBuilder(), new SsrfGuard());
    const result = await executor.buildRequest(
      { url: "http://127.0.0.1/api", method: "GET", allowPrivateNetworkTargets: true, ctx: {} as any },
      { json: {} },
    );
    assert.ok(result.url, "URL must be returned");
  });
});

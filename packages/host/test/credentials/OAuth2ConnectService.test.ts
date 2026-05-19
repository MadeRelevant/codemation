import { describe, expect, it } from "vitest";
import { OAuth2ConnectService } from "../../src/domain/credentials/OAuth2ConnectServiceFactory";
import { makeAppConfig } from "../testkit/AppConfigFixturesFactory";

/**
 * Constructs an OAuth2ConnectService with all dependencies stubbed out (null-typed).
 * Only tests that exercise appConfig-only paths (getRedirectUri) are safe to use here.
 */
function makeService(publicBaseUrl?: string): OAuth2ConnectService {
  const appConfig = makeAppConfig({
    env: publicBaseUrl ? { CODEMATION_PUBLIC_BASE_URL: publicBaseUrl } : {},
  });

  return new OAuth2ConnectService(
    null as never, // credentialStore
    null as never, // credentialInstanceService
    null as never, // credentialTypeRegistry
    null as never, // credentialRuntimeMaterialService
    null as never, // credentialFieldEnvOverlayService
    null as never, // credentialMaterialResolver
    null as never, // credentialSecretCipher
    null as never, // credentialOAuth2ScopeResolver
    null as never, // oauth2ProviderRegistry
    appConfig,
  );
}

describe("OAuth2ConnectService.getRedirectUri", () => {
  it("uses requestOrigin when CODEMATION_PUBLIC_BASE_URL is not set", () => {
    const svc = makeService();
    const uri = svc.getRedirectUri("http://localhost:3000");
    expect(uri).toBe("http://localhost:3000/api/oauth2/callback");
  });

  it("rewrites 127.0.0.1 loopback to localhost", () => {
    const svc = makeService("http://127.0.0.1:3000");
    const uri = svc.getRedirectUri("http://ignored");
    expect(uri).toContain("localhost");
    expect(uri).not.toContain("127.0.0.1");
  });

  it("rewrites [::1] loopback to localhost", () => {
    const svc = makeService("http://[::1]:4000");
    const uri = svc.getRedirectUri("http://ignored");
    expect(uri).toContain("localhost");
  });

  it("uses CODEMATION_PUBLIC_BASE_URL when set", () => {
    const svc = makeService("https://app.example.com");
    const uri = svc.getRedirectUri("http://should-be-ignored");
    expect(uri).toBe("https://app.example.com/api/oauth2/callback");
  });

  it("uses first segment from comma-separated proxy forwarding list", () => {
    const svc = makeService("https://primary.example.com,https://secondary.example.com");
    const uri = svc.getRedirectUri("http://ignored");
    expect(uri).toContain("primary.example.com");
    expect(uri).not.toContain("secondary.example.com");
  });

  it("auto-prepends http:// when scheme is missing from public base URL", () => {
    const svc = makeService("localhost:4000");
    const uri = svc.getRedirectUri("http://ignored");
    expect(uri).toContain("localhost");
    expect(uri).toContain("/api/oauth2/callback");
  });

  it("throws ApplicationRequestError when base URL has an obviously invalid hostname (http as hostname)", () => {
    const svc = makeService("http,http");
    expect(() => svc.getRedirectUri("http://ignored")).toThrow(/Invalid OAuth2 public base URL/);
  });

  it("throws ApplicationRequestError for a completely invalid base URL", () => {
    // Force an unparseable URL by providing a bare colon
    const svc = makeService("://bad-url");
    expect(() => svc.getRedirectUri("http://ignored")).toThrow(/Invalid public base URL/);
  });

  it("throws when no public base URL and requestOrigin is empty", () => {
    const svc = makeService();
    expect(() => svc.getRedirectUri("")).toThrow(/Unable to resolve the public base URL/);
  });

  it("appends /api/oauth2/callback to the base URL", () => {
    const svc = makeService("https://api.example.com/some/base");
    const uri = svc.getRedirectUri("http://ignored");
    expect(uri).toContain("/api/oauth2/callback");
  });

  it("preserves non-loopback hosts without rewriting", () => {
    const svc = makeService("https://production.example.com");
    const uri = svc.getRedirectUri("http://ignored");
    expect(uri).toContain("production.example.com");
  });
});

// ── handleCallback error paths ────────────────────────────────────────────────

function makeFullService(
  opts: {
    credentialStore?: Record<string, unknown>;
    credentialInstanceService?: Record<string, unknown>;
    credentialTypeRegistry?: Record<string, unknown>;
  } = {},
): OAuth2ConnectService {
  const appConfig = makeAppConfig({ env: {} });
  return new OAuth2ConnectService(
    (opts.credentialStore ?? {}) as never,
    (opts.credentialInstanceService ?? {}) as never,
    (opts.credentialTypeRegistry ?? {}) as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    appConfig,
  );
}

describe("OAuth2ConnectService.handleCallback — error paths", () => {
  it("throws 400 when code is missing", async () => {
    const svc = makeFullService();
    await expect(
      svc.handleCallback({ code: null, state: "state-1", requestOrigin: "http://localhost:3000" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when state is missing", async () => {
    const svc = makeFullService();
    await expect(
      svc.handleCallback({ code: "code-1", state: null, requestOrigin: "http://localhost:3000" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when both code and state are missing", async () => {
    const svc = makeFullService();
    await expect(svc.handleCallback({ requestOrigin: "http://localhost:3000" })).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when OAuth2 state is not found in store", async () => {
    const svc = makeFullService({
      credentialStore: { consumeOAuth2State: async () => null },
    });
    await expect(
      svc.handleCallback({ code: "code-1", state: "invalid-state", requestOrigin: "http://localhost:3000" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when OAuth2 state is expired", async () => {
    const expiredState = {
      state: "state-1",
      instanceId: "inst-1",
      codeVerifier: "verifier",
      requestedScopes: ["email"],
      createdAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T00:10:00.000Z", // already expired
    };
    const svc = makeFullService({
      credentialStore: { consumeOAuth2State: async () => expiredState },
    });
    await expect(
      svc.handleCallback({ code: "code-1", state: "state-1", requestOrigin: "http://localhost:3000" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

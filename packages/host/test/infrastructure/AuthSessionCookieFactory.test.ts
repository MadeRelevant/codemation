import { describe, expect, it } from "vitest";

import { AuthSessionCookieFactory } from "../../src/infrastructure/auth/AuthSessionCookieFactory";
import { SecureRequestDetector } from "../../src/infrastructure/auth/SecureRequestDetector";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

function createTestAppConfig(): AppConfig {
  return {
    consumerRoot: "/tmp/codemation-consumer",
    repoRoot: "/tmp/codemation-repo",
    env: {
      NODE_ENV: "development",
      AUTH_SECRET: "dev-secret-minimum-32-characters",
    },
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    collections: [],
    plugins: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    persistence: { kind: "none" },
    scheduler: { kind: "local", workerQueues: [] },
    eventing: { kind: "memory" },
    auth: undefined,
    whitelabel: {},
    webSocketPort: 3001,
    webSocketBindHost: "127.0.0.1",
    mcpServers: [],
  };
}

function createFactory(): AuthSessionCookieFactory {
  return new AuthSessionCookieFactory(createTestAppConfig(), new SecureRequestDetector());
}

describe("AuthSessionCookieFactory", () => {
  it("emits codemation.csrf-token for plaintext HTTP requests", () => {
    const request = new Request("http://127.0.0.1/api/auth/session");
    const result = createFactory().ensureCsrfCookie(request);
    expect(result.csrfToken.length).toBeGreaterThan(0);
    expect(result.cookieHeader).toMatch(/^codemation\.csrf-token=/);
  });

  it("emits __Host-codemation.csrf-token when x-forwarded-proto is https", () => {
    const request = new Request("http://127.0.0.1/api/auth/session", {
      headers: { "x-forwarded-proto": "https" },
    });
    const result = createFactory().ensureCsrfCookie(request);
    expect(result.cookieHeader).toMatch(/^__Host-codemation\.csrf-token=/);
  });

  it("reuses an existing CSRF cookie without emitting Set-Cookie", () => {
    const request = new Request("http://127.0.0.1/", {
      headers: { cookie: "codemation.csrf-token=already" },
    });
    const result = createFactory().ensureCsrfCookie(request);
    expect(result.cookieHeader).toBeNull();
    expect(result.csrfToken).toBe("already");
  });

  it("uses __Secure-authjs.session-token when issuing sessions behind TLS termination", async () => {
    const request = new Request("http://127.0.0.1/", {
      headers: { "x-forwarded-proto": "https" },
    });
    const header = await createFactory().createSessionCookie(request, {
      id: "user-1",
      email: "a@example.com",
      name: "A",
    });
    expect(header).toMatch(/^__Secure-authjs\.session-token=/);
  });

  it("clearSessionCookie emits authjs.session-token with maxAge=0 for HTTP request", () => {
    const request = new Request("http://127.0.0.1/api/auth/signout");
    const header = createFactory().clearSessionCookie(request);
    expect(header).toMatch(/authjs\.session-token=/);
    expect(header).toMatch(/Max-Age=0/);
  });

  it("clearSessionCookie emits __Secure-authjs.session-token for HTTPS request", () => {
    const request = new Request("http://127.0.0.1/api/auth/signout", {
      headers: { "x-forwarded-proto": "https" },
    });
    const header = createFactory().clearSessionCookie(request);
    expect(header).toMatch(/__Secure-authjs\.session-token=/);
    expect(header).toMatch(/Max-Age=0/);
  });

  it("assertCsrf passes when header matches cookie token", () => {
    const csrfToken = "test-csrf-token";
    const request = new Request("http://127.0.0.1/api/auth/login", {
      method: "POST",
      headers: {
        cookie: `codemation.csrf-token=${csrfToken}`,
        "x-codemation-csrf-token": csrfToken,
      },
    });
    expect(() => createFactory().assertCsrf(request)).not.toThrow();
  });

  it("assertCsrf throws 403 when header token does not match cookie token", () => {
    const request = new Request("http://127.0.0.1/api/auth/login", {
      method: "POST",
      headers: {
        cookie: "codemation.csrf-token=valid-token",
        "x-codemation-csrf-token": "wrong-token",
      },
    });
    expect(() => createFactory().assertCsrf(request)).toThrow();
    try {
      createFactory().assertCsrf(request);
    } catch (err) {
      expect((err as { status?: number }).status).toBe(403);
    }
  });

  it("assertCsrf throws 403 when csrf header is missing", () => {
    const request = new Request("http://127.0.0.1/api/auth/login", {
      method: "POST",
      headers: { cookie: "codemation.csrf-token=valid-token" },
    });
    expect(() => createFactory().assertCsrf(request)).toThrow();
  });

  it("requireAuthSecret throws when NODE_ENV=production and AUTH_SECRET is empty", async () => {
    const productionConfig: AppConfig = {
      ...createTestAppConfig(),
      env: { NODE_ENV: "production", AUTH_SECRET: "" },
    };
    const factory = new AuthSessionCookieFactory(productionConfig, new SecureRequestDetector());
    const request = new Request("http://127.0.0.1/", {
      headers: { "x-forwarded-proto": "https" },
    });
    await expect(factory.createSessionCookie(request, { id: "user-1", email: null, name: null })).rejects.toThrow(
      /AUTH_SECRET/,
    );
  });

  it("createSessionCookie works with null email and name", async () => {
    const request = new Request("http://127.0.0.1/");
    const header = await createFactory().createSessionCookie(request, { id: "user-1", email: null, name: null });
    expect(header).toMatch(/authjs\.session-token=/);
  });
});

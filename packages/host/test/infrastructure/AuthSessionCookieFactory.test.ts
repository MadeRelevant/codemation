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
    plugins: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    persistence: { kind: "none" },
    scheduler: { kind: "local", workerQueues: [] },
    eventing: { kind: "memory" },
    auth: undefined,
    whitelabel: {},
    webSocketPort: 3001,
    webSocketBindHost: "127.0.0.1",
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
});

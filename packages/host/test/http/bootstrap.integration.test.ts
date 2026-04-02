// @vitest-environment node

import { encode } from "@auth/core/jwt";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";

class BootstrapIntegrationFixture {
  static readonly authSecret = "codemation-bootstrap-test-secret-minimum-32";
  static readonly googleClientSecretValue = "super-secret-google-client-secret";

  createConfig(): CodemationConfig {
    return {
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: {
        kind: "oauth",
        oauth: [
          {
            provider: "google",
            clientIdEnv: "GOOGLE_CLIENT_ID",
            clientSecretEnv: "GOOGLE_CLIENT_SECRET",
          },
        ],
      },
      whitelabel: {
        productName: "Bootstrap integration test",
      },
    };
  }

  createEnv(): NodeJS.ProcessEnv {
    return {
      AUTH_SECRET: BootstrapIntegrationFixture.authSecret,
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: BootstrapIntegrationFixture.googleClientSecretValue,
      NODE_ENV: "production",
    };
  }

  async createAuthorizationHeader(): Promise<string> {
    const token = await encode({
      secret: BootstrapIntegrationFixture.authSecret,
      salt: "authjs.session-token",
      token: {
        sub: "bootstrap-integration-user",
        email: "bootstrap@codemation.test",
        name: "Bootstrap Integration",
      },
    });
    return `Bearer ${encodeURIComponent(token)}`;
  }
}

describe("http bootstrap routes", () => {
  const fixture = new BootstrapIntegrationFixture();
  let harness: FrontendHttpIntegrationHarness;

  beforeAll(async () => {
    harness = new FrontendHttpIntegrationHarness({
      config: fixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../.."),
      env: fixture.createEnv(),
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("rejects unauthenticated bootstrap requests", async () => {
    const publicResponse = await harness.request({
      method: "GET",
      url: ApiPaths.frontendBootstrap(),
    });
    const internalResponse = await harness.request({
      method: "GET",
      url: ApiPaths.internalAuthBootstrap(),
    });

    expect(publicResponse.statusCode).toBe(401);
    expect(internalResponse.statusCode).toBe(401);
  });

  it("serves a frontend-safe public bootstrap payload after authentication", async () => {
    const authorization = await fixture.createAuthorizationHeader();
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.frontendBootstrap(),
      headers: {
        authorization,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.header("content-type") ?? "")).toContain("application/json");

    const payload = response.json<Record<string, unknown>>();
    expect(payload).toEqual({
      credentialsEnabled: false,
      logoUrl: null,
      oauthProviders: [{ id: "google", name: "Google" }],
      productName: "Bootstrap integration test",
      uiAuthEnabled: true,
    });
    expect(payload).not.toHaveProperty("authConfig");
    expect(payload).not.toHaveProperty("secret");
    expect(response.body).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(response.body).not.toContain(BootstrapIntegrationFixture.googleClientSecretValue);
    expect(response.body).not.toContain(BootstrapIntegrationFixture.authSecret);
  });

  it("serves internal auth bootstrap without leaking secret values", async () => {
    const authorization = await fixture.createAuthorizationHeader();
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.internalAuthBootstrap(),
      headers: {
        authorization,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.header("content-type") ?? "")).toContain("application/json");

    const payload = response.json<Record<string, unknown>>();
    expect(payload).toEqual({
      authConfig: {
        kind: "oauth",
        oauth: [
          {
            provider: "google",
            clientIdEnv: "GOOGLE_CLIENT_ID",
            clientSecretEnv: "GOOGLE_CLIENT_SECRET",
          },
        ],
      },
      credentialsEnabled: false,
      oauthProviders: [{ id: "google", name: "Google" }],
      uiAuthEnabled: true,
    });
    expect(payload).not.toHaveProperty("secret");
    expect(response.body).not.toContain(BootstrapIntegrationFixture.googleClientSecretValue);
    expect(response.body).not.toContain(BootstrapIntegrationFixture.authSecret);
  });
});

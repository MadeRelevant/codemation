import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationAuthCore } from "../../src/infrastructure/auth/CodemationAuthCore";
import { CodemationAuthProviderCatalog } from "../../src/infrastructure/auth/CodemationAuthProviderCatalog";
import { CodemationAuthRequestFactory } from "../../src/infrastructure/auth/CodemationAuthRequestFactory";
import type { PrismaClient } from "../../src/infrastructure/persistence/generated/prisma-client/client.js";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

class FakePrismaClientFactory {
  create(): PrismaClient {
    return {} as PrismaClient;
  }
}

class CodemationAuthCoreFixture {
  private readonly fakePrismaClientFactory = new FakePrismaClientFactory();

  createSubject(): CodemationAuthCore {
    return new CodemationAuthCore(
      this.createAppConfig(),
      this.fakePrismaClientFactory.create(),
      new CodemationAuthProviderCatalog(),
      new CodemationAuthRequestFactory(),
    );
  }

  createRequest(): Request {
    return new Request("http://127.0.0.1:3001/api/auth/oauth/google/start?callbackUrl=%2F");
  }

  private createAppConfig(): AppConfig {
    return {
      consumerRoot: "/tmp/codemation-consumer",
      repoRoot: "/tmp/codemation-repo",
      env: {
        NODE_ENV: "development",
        AUTH_SECRET: "dev-secret-minimum-32-characters",
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
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
      whitelabel: {},
      webSocketPort: 3001,
      webSocketBindHost: "127.0.0.1",
    };
  }
}

test("CodemationAuthCore starts OAuth with the backend auth base path", async () => {
  const fixture = new CodemationAuthCoreFixture();

  const response = await fixture.createSubject().startOAuth(fixture.createRequest(), "google");

  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /^https:\/\/accounts\.google\.com\//);
  assert.notEqual(response.headers.get("set-cookie"), null);
});

import assert from "node:assert/strict";
import { test } from "vitest";

import { AppContainerFactory } from "../../src/bootstrap/AppContainerFactory";
import type { AppConfig } from "../../src/presentation/config/AppConfig";
import { CodemationHonoApiApp } from "../../src/presentation/http/hono/CodemationHonoApiAppFactory";

class AppContainerFactoryFixture {
  createAppConfig(): AppConfig {
    return {
      consumerRoot: "/tmp/codemation-consumer",
      repoRoot: "/tmp/codemation-repo",
      env: {
        NODE_ENV: "development",
        AUTH_SECRET: "dev-secret",
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
      auth: {
        kind: "local",
        allowUnauthenticatedInDevelopment: false,
      },
      whitelabel: {},
      webSocketPort: 3001,
      webSocketBindHost: "127.0.0.1",
      mcpServers: [],
    };
  }
}

test("AppContainerFactory resolves the Hono API app for local auth dev config", async () => {
  const fixture = new AppContainerFactoryFixture();
  const container = await new AppContainerFactory().create({
    appConfig: fixture.createAppConfig(),
    sharedWorkflowWebsocketServer: null,
  });

  assert.ok(container.resolve(CodemationHonoApiApp));
});

test("AppContainerFactory boots without error in non-managed mode when WORKSPACE_PAIRING_SECRET is invalid", async () => {
  // Regression: an invalid (non-32-byte) WORKSPACE_PAIRING_SECRET must not crash non-managed-mode boot.
  const fixture = new AppContainerFactoryFixture();
  const appConfig = fixture.createAppConfig();
  const appConfigWithBadSecret: AppConfig = {
    ...appConfig,
    env: {
      ...appConfig.env,
      WORKSPACE_ID: "ws-test",
      WORKSPACE_PAIRING_SECRET: "tooshort", // invalid — not a 32-byte base64 value
      CONTROL_PLANE_URL: "https://cp.example.com",
    },
  };

  // Should not throw — pairing is silently disabled with a warning.
  const container = await new AppContainerFactory().create({
    appConfig: appConfigWithBadSecret,
    sharedWorkflowWebsocketServer: null,
  });

  assert.ok(container.resolve(CodemationHonoApiApp));
});

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

import assert from "node:assert/strict";
import { test } from "vitest";

import { ApplicationTokens } from "../../src/applicationTokens";
import { AppContainerFactory } from "../../src/bootstrap/AppContainerFactory";
import { DevelopmentSessionBypassVerifier } from "../../src/infrastructure/auth/DevelopmentSessionBypassVerifier";
import type { AppConfig } from "../../src/presentation/config/AppConfig";
import { CodemationHonoApiApp } from "../../src/presentation/http/hono/CodemationHonoApiAppFactory";

class AppContainerFactoryFixture {
  createAppConfig(overrides?: Readonly<Partial<AppConfig> & { env?: NodeJS.ProcessEnv }>): AppConfig {
    return {
      consumerRoot: "/tmp/codemation-consumer",
      repoRoot: "/tmp/codemation-repo",
      env: {
        NODE_ENV: "development",
        AUTH_SECRET: "dev-secret",
        ...(overrides?.env ?? {}),
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
      ...overrides,
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

test("AppContainerFactory allows development auth bypass for packaged UI dev runtime", async () => {
  const fixture = new AppContainerFactoryFixture();
  const container = await new AppContainerFactory().create({
    appConfig: fixture.createAppConfig({
      env: {
        NODE_ENV: "production",
        AUTH_SECRET: "dev-secret",
        CODEMATION_RUNTIME_DEV_URL: "http://127.0.0.1:3102",
      },
      auth: {
        kind: "local",
        allowUnauthenticatedInDevelopment: true,
      },
    }),
    sharedWorkflowWebsocketServer: null,
  });

  assert.ok(container.resolve(ApplicationTokens.SessionVerifier) instanceof DevelopmentSessionBypassVerifier);
});

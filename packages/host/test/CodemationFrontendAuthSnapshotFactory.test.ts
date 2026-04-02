import assert from "node:assert/strict";
import { test } from "vitest";

import {
  CodemationFrontendAuthSnapshotFactory,
  CodemationFrontendAuthSnapshotJsonCodec,
  FrontendAppConfigFactory,
  InternalAuthBootstrapFactory,
  InternalAuthBootstrapJsonCodec,
  PublicFrontendBootstrapFactory,
  PublicFrontendBootstrapJsonCodec,
} from "../src";
import type { AppConfig, CodemationAuthConfig } from "../src";
import { InternalAuthBootstrapHttpRouteHandler } from "../src/presentation/http/routeHandlers/InternalAuthBootstrapHttpRouteHandler";
import { PublicFrontendBootstrapHttpRouteHandler } from "../src/presentation/http/routeHandlers/PublicFrontendBootstrapHttpRouteHandler";

class FrontendAppConfigFixture {
  create(
    args?: Readonly<{ auth?: CodemationAuthConfig; env?: NodeJS.ProcessEnv; whitelabel?: AppConfig["whitelabel"] }>,
  ): AppConfig {
    return {
      consumerRoot: "/tmp/my-automation",
      repoRoot: "/workspace/codemation",
      env: args?.env ?? { NODE_ENV: "production", AUTH_SECRET: "prod-secret" },
      workflowSources: [],
      workflows: [],
      containerRegistrations: [],
      credentialTypes: [],
      plugins: [],
      hasConfiguredCredentialSessionServiceRegistration: false,
      persistence: { kind: "none" },
      scheduler: { kind: "local", workerQueues: [] },
      eventing: { kind: "memory" },
      auth: args?.auth,
      whitelabel: args?.whitelabel ?? {},
      webSocketPort: 3001,
      webSocketBindHost: "0.0.0.0",
    };
  }
}

test("CodemationFrontendAuthSnapshotFactory disables UI auth when development auth bypass is allowed", () => {
  const factory = new CodemationFrontendAuthSnapshotFactory();
  const appConfig: AppConfig = {
    consumerRoot: "/tmp/my-automation",
    repoRoot: "/workspace/codemation",
    env: { NODE_ENV: "development" },
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
      allowUnauthenticatedInDevelopment: true,
    },
    whitelabel: {},
    webSocketPort: 3001,
    webSocketBindHost: "0.0.0.0",
  };

  const snapshot = factory.createFromAppConfig(appConfig);

  assert.equal(snapshot.uiAuthEnabled, false);
  assert.equal(snapshot.credentialsEnabled, true);
  assert.equal(snapshot.secret, "codemation-dev-auth-secret-not-for-production");
  assert.deepEqual(snapshot.oauthProviders, []);
});

test("CodemationFrontendAuthSnapshotFactory resolves OAuth provider descriptors and configured secrets", () => {
  const factory = new CodemationFrontendAuthSnapshotFactory();
  const authConfig: CodemationAuthConfig = {
    kind: "oauth",
    oauth: [{ provider: "google", clientIdEnv: "GOOGLE_ID", clientSecretEnv: "GOOGLE_SECRET" }],
    oidc: [{ id: "okta", issuer: "https://example.com", clientIdEnv: "OKTA_ID", clientSecretEnv: "OKTA_SECRET" }],
  };

  const snapshot = factory.createFromResolvedInputs({
    authConfig,
    env: { NODE_ENV: "production", AUTH_SECRET: "prod-secret" },
    uiAuthEnabled: true,
  });

  assert.equal(snapshot.uiAuthEnabled, true);
  assert.equal(snapshot.credentialsEnabled, false);
  assert.equal(snapshot.secret, "prod-secret");
  assert.deepEqual(snapshot.oauthProviders, [
    { id: "google", name: "Google" },
    { id: "okta", name: "okta" },
  ]);
});

test("CodemationFrontendAuthSnapshotFactory maps GitHub and Microsoft provider labels", () => {
  const snapshot = new CodemationFrontendAuthSnapshotFactory().createFromResolvedInputs({
    authConfig: {
      kind: "oauth",
      oauth: [
        { provider: "github", clientIdEnv: "GITHUB_ID", clientSecretEnv: "GITHUB_SECRET" },
        { provider: "microsoft-entra-id", clientIdEnv: "MS_ID", clientSecretEnv: "MS_SECRET" },
      ],
    },
    env: { NODE_ENV: "production", AUTH_SECRET: "prod-secret" },
    uiAuthEnabled: true,
  });

  assert.deepEqual(snapshot.oauthProviders, [
    { id: "github", name: "GitHub" },
    { id: "microsoft-entra-id", name: "Microsoft" },
  ]);
});

test("CodemationFrontendAuthSnapshotFactory returns null secret in production when none is configured", () => {
  const snapshot = new CodemationFrontendAuthSnapshotFactory().createFromResolvedInputs({
    authConfig: undefined,
    env: { NODE_ENV: "production" },
    uiAuthEnabled: true,
  });

  assert.equal(snapshot.secret, null);
});

test("CodemationFrontendAuthSnapshotFactory ignores NEXTAUTH_SECRET legacy aliases", () => {
  const snapshot = new CodemationFrontendAuthSnapshotFactory().createFromResolvedInputs({
    authConfig: { kind: "local" },
    env: { NODE_ENV: "production", NEXTAUTH_SECRET: "legacy-secret" },
    uiAuthEnabled: true,
  });

  assert.equal(snapshot.secret, null);
});

test("CodemationFrontendAuthSnapshotJsonCodec round-trips auth snapshots", () => {
  const codec = new CodemationFrontendAuthSnapshotJsonCodec();
  const snapshot = new CodemationFrontendAuthSnapshotFactory().createFromResolvedInputs({
    authConfig: { kind: "local" },
    env: { NODE_ENV: "development", AUTH_SECRET: "dev-secret" },
    uiAuthEnabled: true,
  });

  assert.deepEqual(codec.deserialize(codec.serialize(snapshot)), snapshot);
});

test("CodemationFrontendAuthSnapshotJsonCodec returns null for invalid JSON", () => {
  assert.equal(new CodemationFrontendAuthSnapshotJsonCodec().deserialize("{not-json"), null);
});

test("FrontendAppConfigFactory projects auth and branding from AppConfig", () => {
  const appConfig = new FrontendAppConfigFixture().create({
    auth: { kind: "local" },
    whitelabel: { productName: "Acme Corp" },
  });

  const snapshot = new FrontendAppConfigFactory(appConfig, new CodemationFrontendAuthSnapshotFactory()).create();

  assert.equal(snapshot.auth.credentialsEnabled, true);
  assert.equal(snapshot.auth.secret, "prod-secret");
  assert.equal(snapshot.productName, "Acme Corp");
});

test("PublicFrontendBootstrapFactory strips auth config and secrets for the Next shell", () => {
  const appConfig = new FrontendAppConfigFixture().create({
    auth: { kind: "local" },
    whitelabel: { productName: "Acme Corp" },
  });

  const bootstrap = new PublicFrontendBootstrapFactory(
    new FrontendAppConfigFactory(appConfig, new CodemationFrontendAuthSnapshotFactory()),
  ).create();

  assert.deepEqual(bootstrap, {
    credentialsEnabled: true,
    logoUrl: null,
    oauthProviders: [],
    productName: "Acme Corp",
    uiAuthEnabled: true,
  });
});

test("InternalAuthBootstrapFactory keeps declarative auth config but not secrets", () => {
  const appConfig = new FrontendAppConfigFixture().create({
    auth: {
      kind: "oauth",
      oauth: [{ provider: "github", clientIdEnv: "GITHUB_ID", clientSecretEnv: "GITHUB_SECRET" }],
    },
  });

  const bootstrap = new InternalAuthBootstrapFactory(appConfig, new CodemationFrontendAuthSnapshotFactory()).create();

  assert.deepEqual(bootstrap, {
    authConfig: appConfig.auth,
    credentialsEnabled: false,
    oauthProviders: [{ id: "github", name: "GitHub" }],
    uiAuthEnabled: true,
  });
});

test("PublicFrontendBootstrapJsonCodec round-trips public bootstrap payloads", () => {
  const codec = new PublicFrontendBootstrapJsonCodec();
  const bootstrap = new PublicFrontendBootstrapFactory(
    new FrontendAppConfigFactory(
      new FrontendAppConfigFixture().create({ auth: { kind: "local" }, whitelabel: { productName: "Acme Corp" } }),
      new CodemationFrontendAuthSnapshotFactory(),
    ),
  ).create();

  assert.deepEqual(codec.deserialize(codec.serialize(bootstrap)), bootstrap);
});

test("InternalAuthBootstrapJsonCodec round-trips internal auth bootstrap payloads", () => {
  const codec = new InternalAuthBootstrapJsonCodec();
  const bootstrap = new InternalAuthBootstrapFactory(
    new FrontendAppConfigFixture().create({
      auth: {
        kind: "oauth",
        oauth: [{ provider: "google", clientIdEnv: "GOOGLE_ID", clientSecretEnv: "GOOGLE_SECRET" }],
      },
    }),
    new CodemationFrontendAuthSnapshotFactory(),
  ).create();

  assert.deepEqual(codec.deserialize(codec.serialize(bootstrap)), bootstrap);
});

test("PublicFrontendBootstrapHttpRouteHandler returns bootstrap JSON", async () => {
  const bootstrapFactory = new PublicFrontendBootstrapFactory(
    new FrontendAppConfigFactory(
      new FrontendAppConfigFixture().create({ auth: { kind: "local" }, whitelabel: { productName: "Acme Corp" } }),
      new CodemationFrontendAuthSnapshotFactory(),
    ),
  );
  const response = new PublicFrontendBootstrapHttpRouteHandler(bootstrapFactory).getBootstrap();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    credentialsEnabled: true,
    logoUrl: null,
    oauthProviders: [],
    productName: "Acme Corp",
    uiAuthEnabled: true,
  });
});

test("InternalAuthBootstrapHttpRouteHandler returns node auth bootstrap JSON", async () => {
  const appConfig = new FrontendAppConfigFixture().create({
    auth: {
      kind: "oauth",
      oauth: [{ provider: "google", clientIdEnv: "GOOGLE_ID", clientSecretEnv: "GOOGLE_SECRET" }],
    },
  });
  const response = new InternalAuthBootstrapHttpRouteHandler(
    new InternalAuthBootstrapFactory(appConfig, new CodemationFrontendAuthSnapshotFactory()),
  ).getBootstrap();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authConfig: appConfig.auth,
    credentialsEnabled: false,
    oauthProviders: [{ id: "google", name: "Google" }],
    uiAuthEnabled: true,
  });
});

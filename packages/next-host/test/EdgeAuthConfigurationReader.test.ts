import assert from "node:assert/strict";
import { test } from "vitest";

import { AuthSnapshotReader } from "../src/auth/AuthSnapshotReader";
import { EdgeAuthConfigurationReader } from "../src/auth/EdgeAuthConfigurationReader";

test("EdgeAuthConfigurationReader resolves the local edge seed from environment", () => {
  const configuration = new EdgeAuthConfigurationReader().readFromEnvironment({
    AUTH_SECRET: "dev-secret",
    CODEMATION_UI_AUTH_ENABLED: "false",
    NODE_ENV: "development",
  });

  assert.deepEqual(configuration, {
    authSecret: "dev-secret",
    uiAuthEnabled: false,
  });
});

test("AuthSnapshotReader falls back to the development auth secret when needed", () => {
  assert.equal(
    AuthSnapshotReader.readFromEnvironment({
      NODE_ENV: "development",
    })?.secret,
    "codemation-dev-auth-secret-not-for-production",
  );
});

test("AuthSnapshotReader prefers the serialized frontend auth snapshot when available", () => {
  const snapshot = AuthSnapshotReader.readFromEnvironment({
    CODEMATION_FRONTEND_APP_CONFIG_JSON: JSON.stringify({
      auth: {
        config: {
          kind: "local",
        },
        credentialsEnabled: true,
        oauthProviders: [],
        secret: "runtime-secret",
        uiAuthEnabled: true,
      },
      productName: "Codemation",
      logoUrl: null,
    }),
    NODE_ENV: "development",
  });

  assert.deepEqual(snapshot, {
    config: {
      kind: "local",
    },
    credentialsEnabled: true,
    oauthProviders: [],
    secret: "runtime-secret",
    uiAuthEnabled: true,
  });
});

import assert from "node:assert/strict";
import { test } from "vitest";

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

test("EdgeAuthConfigurationReader falls back to the development auth secret when needed", () => {
  assert.equal(
    new EdgeAuthConfigurationReader().readFromEnvironment({
      NODE_ENV: "development",
    }).authSecret,
    "codemation-dev-auth-secret-not-for-production",
  );
});

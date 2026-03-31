import assert from "node:assert/strict";
import { test } from "vitest";

import { FrontendAppConfigJsonCodec } from "@codemation/host/client";

import { AuthSnapshotResolver } from "../src/auth/AuthSnapshotResolver";

test("AuthSnapshotResolver reads the serialized auth snapshot from environment", async () => {
  const savedSnapshot = process.env.CODEMATION_FRONTEND_APP_CONFIG_JSON;
  try {
    process.env.CODEMATION_FRONTEND_APP_CONFIG_JSON = new FrontendAppConfigJsonCodec().serialize({
      auth: {
        config: { kind: "local" },
        credentialsEnabled: true,
        oauthProviders: [{ id: "github", name: "GitHub" }],
        secret: "dev-secret",
        uiAuthEnabled: true,
      },
      productName: "Codemation",
      logoUrl: null,
    });

    const snapshot = await AuthSnapshotResolver.resolve();

    assert.equal(snapshot.credentialsEnabled, true);
    assert.equal(snapshot.secret, "dev-secret");
    assert.deepEqual(snapshot.oauthProviders, [{ id: "github", name: "GitHub" }]);
  } finally {
    if (savedSnapshot === undefined) {
      delete process.env.CODEMATION_FRONTEND_APP_CONFIG_JSON;
    } else {
      process.env.CODEMATION_FRONTEND_APP_CONFIG_JSON = savedSnapshot;
    }
  }
});

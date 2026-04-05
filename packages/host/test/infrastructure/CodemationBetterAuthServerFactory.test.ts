import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationBetterAuthServerFactory } from "../../src/infrastructure/auth/CodemationBetterAuthServerFactory";
import type { CodemationAuthConfig } from "../../src/presentation/config/CodemationAuthConfig";

test("CodemationBetterAuthServerFactory lists configured OAuth and OIDC provider UI ids", () => {
  const auth: CodemationAuthConfig = {
    kind: "oauth",
    oauth: [
      { provider: "google", clientIdEnv: "G", clientSecretEnv: "GS" },
      { provider: "microsoft", clientIdEnv: "M", clientSecretEnv: "MS" },
    ],
    oidc: [{ id: "okta-demo", issuer: "https://example.okta.com", clientIdEnv: "O", clientSecretEnv: "OS" }],
  };
  const ids = CodemationBetterAuthServerFactory.listConfiguredOAuthProviderIds(auth);
  assert.deepEqual([...ids].sort(), ["google", "microsoft", "okta-demo"].sort());
});

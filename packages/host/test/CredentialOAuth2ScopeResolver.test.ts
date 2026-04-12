import assert from "node:assert/strict";
import { test } from "vitest";
import { CredentialOAuth2ScopeResolver } from "../src/domain/credentials/CredentialOAuth2ScopeResolver";

test("CredentialOAuth2ScopeResolver falls back to static scopes", () => {
  const resolver = new CredentialOAuth2ScopeResolver();
  const scopes = resolver.resolveRequestedScopes(
    {
      kind: "oauth2",
      providerId: "google",
      scopes: ["scope.default"],
    },
    {},
  );
  assert.deepEqual(scopes, ["scope.default"]);
});

test("CredentialOAuth2ScopeResolver resolves preset and custom replacement scopes", () => {
  const resolver = new CredentialOAuth2ScopeResolver();
  const auth = {
    kind: "oauth2" as const,
    providerId: "google",
    scopes: ["scope.default"],
    scopesFromPublicConfig: {
      presetFieldKey: "scopePreset",
      presetScopes: {
        automation: ["scope.read", "scope.send"],
      },
      customPresetKey: "custom",
      customScopesFieldKey: "customScopes",
    },
  };
  assert.deepEqual(
    resolver.resolveRequestedScopes(auth, {
      scopePreset: "automation",
    }),
    ["scope.read", "scope.send"],
  );
  assert.deepEqual(
    resolver.resolveRequestedScopes(auth, {
      scopePreset: "custom",
      customScopes: "scope.alpha, scope.beta\nscope.alpha",
    }),
    ["scope.alpha", "scope.beta"],
  );
});

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

test("CredentialOAuth2ScopeResolver falls back when preset is missing, unknown, or custom without scopes", () => {
  const resolver = new CredentialOAuth2ScopeResolver();
  const auth = {
    kind: "oauth2" as const,
    providerId: "google",
    scopes: ["scope.default"],
    scopesFromPublicConfig: {
      presetFieldKey: "scopePreset",
      presetScopes: {
        automation: ["scope.read"],
      },
      customPresetKey: "custom",
      customScopesFieldKey: "customScopes",
    },
  };
  assert.deepEqual(resolver.resolveRequestedScopes(auth, { scopePreset: "" }), ["scope.default"]);
  assert.deepEqual(resolver.resolveRequestedScopes(auth, { scopePreset: "unknown" }), ["scope.default"]);
  assert.deepEqual(resolver.resolveRequestedScopes(auth, { scopePreset: "custom" }), ["scope.default"]);
  assert.deepEqual(
    resolver.resolveRequestedScopes(auth, {
      scopePreset: "custom",
      customScopes: "   \n\t  ",
    }),
    ["scope.default"],
  );
});

test("CredentialOAuth2ScopeResolver resolves custom scopes from arrays and dedupes", () => {
  const resolver = new CredentialOAuth2ScopeResolver();
  const auth = {
    kind: "oauth2" as const,
    providerId: "google",
    scopes: ["scope.default"],
    scopesFromPublicConfig: {
      presetFieldKey: "scopePreset",
      presetScopes: {},
      customPresetKey: "custom",
      customScopesFieldKey: "customScopes",
    },
  };
  assert.deepEqual(
    resolver.resolveRequestedScopes(auth, {
      scopePreset: "custom",
      customScopes: [" scope.a ", "scope.b", "scope.a"],
    }),
    ["scope.a", "scope.b"],
  );
});

test("CredentialOAuth2ScopeResolver uses non-default custom preset key", () => {
  const resolver = new CredentialOAuth2ScopeResolver();
  const auth = {
    kind: "oauth2" as const,
    providerId: "google",
    scopes: ["scope.default"],
    scopesFromPublicConfig: {
      presetFieldKey: "scopePreset",
      presetScopes: {},
      customPresetKey: "other",
      customScopesFieldKey: "scopesText",
    },
  };
  assert.deepEqual(
    resolver.resolveRequestedScopes(auth, {
      scopePreset: "other",
      scopesText: "scope.x scope.y",
    }),
    ["scope.x", "scope.y"],
  );
  assert.deepEqual(resolver.resolveRequestedScopes(auth, { scopePreset: "custom" }), ["scope.default"]);
});

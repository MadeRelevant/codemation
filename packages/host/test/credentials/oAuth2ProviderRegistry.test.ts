import { describe, expect, it } from "vitest";
import type { CredentialTypeDefinition } from "@codemation/core";
import { OAuth2ProviderRegistry } from "../../src/domain/credentials/OAuth2ProviderRegistry";

function makeDefinition(auth: CredentialTypeDefinition["auth"]): CredentialTypeDefinition {
  return {
    typeId: "test-cred",
    displayName: "Test",
    publicFields: [],
    secretFields: [],
    supportedSourceKinds: ["db"],
    auth,
  } as unknown as CredentialTypeDefinition;
}

describe("OAuth2ProviderRegistry.resolve — template variant", () => {
  const registry = new OAuth2ProviderRegistry();

  it("substitutes {publicFieldKey} placeholders into authorize and token URLs", () => {
    const def = makeDefinition({
      kind: "oauth2",
      providerId: "microsoft",
      authorizeUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      scopes: ["openid"],
    });

    const resolved = registry.resolve(def, { tenantId: "common" });

    expect(resolved.providerId).toBe("microsoft");
    expect(resolved.authorizeUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(resolved.tokenUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(resolved.userInfoUrl).toBeUndefined();
  });

  it("URL-encodes substituted values to keep injection-safe", () => {
    const def = makeDefinition({
      kind: "oauth2",
      providerId: "msgraph",
      authorizeUrl: "https://example.com/{slug}/authorize",
      tokenUrl: "https://example.com/{slug}/token",
      scopes: ["openid"],
    });

    const resolved = registry.resolve(def, { slug: "my org/team" });

    expect(resolved.authorizeUrl).toBe("https://example.com/my%20org%2Fteam/authorize");
  });

  it("expands optional userInfoUrl when provided", () => {
    const def = makeDefinition({
      kind: "oauth2",
      providerId: "microsoft",
      authorizeUrl: "https://example.com/{tenantId}/authorize",
      tokenUrl: "https://example.com/{tenantId}/token",
      userInfoUrl: "https://graph.example.com/{tenantId}/userinfo",
      scopes: ["openid"],
    });

    const resolved = registry.resolve(def, { tenantId: "abc-123" });

    expect(resolved.userInfoUrl).toBe("https://graph.example.com/abc-123/userinfo");
  });

  it("throws when a referenced public field is missing or empty", () => {
    const def = makeDefinition({
      kind: "oauth2",
      providerId: "microsoft",
      authorizeUrl: "https://example.com/{tenantId}/authorize",
      tokenUrl: "https://example.com/{tenantId}/token",
      scopes: ["openid"],
    });

    expect(() => registry.resolve(def, {})).toThrow(/public field "tenantId"/);
    expect(() => registry.resolve(def, { tenantId: "" })).toThrow(/public field "tenantId"/);
  });
});

describe("OAuth2ProviderRegistry.resolve — built-in variant", () => {
  const registry = new OAuth2ProviderRegistry();

  it("returns google's hardcoded URLs for providerId=google", () => {
    const def = makeDefinition({ kind: "oauth2", providerId: "google", scopes: ["openid"] });
    const resolved = registry.resolve(def, {});
    expect(resolved.providerId).toBe("google");
    expect(resolved.authorizeUrl).toContain("accounts.google.com");
  });

  it("rejects unknown providerIds with a hint to use authorizeUrl/tokenUrl directly", () => {
    const def = makeDefinition({ kind: "oauth2", providerId: "totally-unknown", scopes: ["openid"] });
    expect(() => registry.resolve(def, {})).toThrow(/authorizeUrl and tokenUrl/);
  });
});

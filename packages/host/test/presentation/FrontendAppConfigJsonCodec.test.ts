import { describe, expect, it } from "vitest";
import { FrontendAppConfigJsonCodec } from "../../src/presentation/frontend/FrontendAppConfigJsonCodec";
import type { FrontendAppConfig } from "../../src/presentation/frontend/FrontendAppConfig";

const codec = new FrontendAppConfigJsonCodec();

function makeConfig(overrides: Partial<FrontendAppConfig> = {}): FrontendAppConfig {
  return {
    auth: {
      config: undefined,
      credentialsEnabled: true,
      oauthProviders: [],
      secret: "my-secret",
      uiAuthEnabled: true,
    },
    productName: "TestApp",
    logoUrl: null,
    ...overrides,
  } as FrontendAppConfig;
}

describe("FrontendAppConfigJsonCodec.serialize", () => {
  it("serializes a config to JSON", () => {
    const config = makeConfig();
    const result = codec.serialize(config);
    expect(JSON.parse(result)).toMatchObject({ productName: "TestApp" });
  });
});

describe("FrontendAppConfigJsonCodec.deserialize", () => {
  it("returns null for undefined input", () => {
    expect(codec.deserialize(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(codec.deserialize("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(codec.deserialize("   ")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(codec.deserialize("not-json")).toBeNull();
  });

  it("returns null when parsed value is not an object", () => {
    expect(codec.deserialize('"a string"')).toBeNull();
  });

  it("returns null when auth property is missing", () => {
    expect(codec.deserialize(JSON.stringify({ productName: "Test" }))).toBeNull();
  });

  it("returns null when auth property is not an object", () => {
    expect(codec.deserialize(JSON.stringify({ auth: "bad" }))).toBeNull();
  });

  it("deserializes a valid config round-trip", () => {
    const config = makeConfig({ productName: "MyApp", logoUrl: "https://example.com/logo.png" });
    const result = codec.deserialize(codec.serialize(config));
    expect(result).not.toBeNull();
    expect(result!.productName).toBe("MyApp");
    expect(result!.logoUrl).toBe("https://example.com/logo.png");
  });

  it("defaults productName to 'Codemation' when missing or empty", () => {
    const json = JSON.stringify({ auth: { credentialsEnabled: false, oauthProviders: [] } });
    const result = codec.deserialize(json);
    expect(result!.productName).toBe("Codemation");
  });

  it("defaults logoUrl to null when missing or empty", () => {
    const json = JSON.stringify({ auth: { credentialsEnabled: false, oauthProviders: [] } });
    const result = codec.deserialize(json);
    expect(result!.logoUrl).toBeNull();
  });

  it("defaults credentialsEnabled to false when not true", () => {
    const json = JSON.stringify({ auth: { credentialsEnabled: "yes", oauthProviders: [] } });
    const result = codec.deserialize(json);
    expect(result!.auth.credentialsEnabled).toBe(false);
  });

  it("defaults uiAuthEnabled to true when not explicitly false", () => {
    const json = JSON.stringify({ auth: {} });
    const result = codec.deserialize(json);
    expect(result!.auth.uiAuthEnabled).toBe(true);
  });

  it("sets uiAuthEnabled to false when explicitly false", () => {
    const json = JSON.stringify({ auth: { uiAuthEnabled: false } });
    const result = codec.deserialize(json);
    expect(result!.auth.uiAuthEnabled).toBe(false);
  });

  it("resolves valid oauth provider snapshots", () => {
    const json = JSON.stringify({
      auth: {
        oauthProviders: [
          { id: "google", name: "Google" },
          { id: "github", name: "GitHub" },
        ],
      },
    });
    const result = codec.deserialize(json);
    expect(result!.auth.oauthProviders).toHaveLength(2);
    expect(result!.auth.oauthProviders[0]).toMatchObject({ id: "google", name: "Google" });
  });

  it("filters out invalid oauth provider entries", () => {
    const json = JSON.stringify({
      auth: {
        oauthProviders: [
          null,
          { id: "google" }, // missing name
          "bad-entry",
          { id: "gh", name: "GitHub" },
        ],
      },
    });
    const result = codec.deserialize(json);
    expect(result!.auth.oauthProviders).toHaveLength(1);
    expect(result!.auth.oauthProviders[0]).toMatchObject({ id: "gh", name: "GitHub" });
  });

  it("returns empty oauthProviders when value is not an array", () => {
    const json = JSON.stringify({ auth: { oauthProviders: "bad" } });
    const result = codec.deserialize(json);
    expect(result!.auth.oauthProviders).toEqual([]);
  });

  it("sets secret to null when missing or empty", () => {
    const json = JSON.stringify({ auth: { secret: "" } });
    const result = codec.deserialize(json);
    expect(result!.auth.secret).toBeNull();
  });

  it("preserves a non-empty auth secret", () => {
    const json = JSON.stringify({ auth: { secret: "my-auth-secret" } });
    const result = codec.deserialize(json);
    expect(result!.auth.secret).toBe("my-auth-secret");
  });
});

import { describe, expect, it } from "vitest";
import { PublicFrontendBootstrapJsonCodec } from "../../src/presentation/frontend/PublicFrontendBootstrapJsonCodec";
import { InternalAuthBootstrapJsonCodec } from "../../src/presentation/frontend/InternalAuthBootstrapJsonCodec";
import { CodemationFrontendAuthSnapshotJsonCodec } from "../../src/presentation/frontend/CodemationFrontendAuthSnapshotJsonCodec";

// ---------------------------------------------------------------------------
// PublicFrontendBootstrapJsonCodec
// ---------------------------------------------------------------------------

describe("PublicFrontendBootstrapJsonCodec", () => {
  const codec = new PublicFrontendBootstrapJsonCodec();

  it("serialize+deserialize round-trips a full object", () => {
    const bootstrap = {
      credentialsEnabled: true,
      logoUrl: "https://example.com/logo.png",
      oauthProviders: [{ id: "github", name: "GitHub" }],
      productName: "MyApp",
      uiAuthEnabled: true,
    };
    const json = codec.serialize(bootstrap);
    const parsed = codec.deserialize(json);
    expect(parsed).toEqual(bootstrap);
  });

  it("deserialize returns null for empty string", () => {
    expect(codec.deserialize("")).toBeNull();
    expect(codec.deserialize("  ")).toBeNull();
    expect(codec.deserialize(undefined)).toBeNull();
  });

  it("deserialize returns null for malformed JSON", () => {
    expect(codec.deserialize("{not-valid-json")).toBeNull();
  });

  it("deserialize returns null for JSON null", () => {
    expect(codec.deserialize("null")).toBeNull();
  });

  it("deserialize uses defaults for missing optional fields", () => {
    const result = codec.deserialize(JSON.stringify({ credentialsEnabled: true }));
    expect(result).toBeDefined();
    expect(result!.productName).toBe("Codemation");
    expect(result!.uiAuthEnabled).toBe(true);
    expect(result!.oauthProviders).toHaveLength(0);
    expect(result!.logoUrl).toBeNull();
  });

  it("deserialize sets uiAuthEnabled false when explicitly false", () => {
    const result = codec.deserialize(JSON.stringify({ uiAuthEnabled: false }));
    expect(result!.uiAuthEnabled).toBe(false);
  });

  it("deserialize includes cpWebOrigin when present", () => {
    const result = codec.deserialize(JSON.stringify({ cpWebOrigin: "https://control.example.com" }));
    expect(result!.cpWebOrigin).toBe("https://control.example.com");
  });

  it("deserialize omits cpWebOrigin when missing", () => {
    const result = codec.deserialize(JSON.stringify({ credentialsEnabled: false }));
    expect(result).not.toHaveProperty("cpWebOrigin");
  });

  it("deserialize filters invalid oauth provider entries", () => {
    const raw = JSON.stringify({
      oauthProviders: [
        { id: "github", name: "GitHub" },
        { id: 123, name: "BadId" },
        { id: "google" }, // missing name
        null,
      ],
    });
    const result = codec.deserialize(raw);
    expect(result!.oauthProviders).toHaveLength(1);
    expect(result!.oauthProviders[0].id).toBe("github");
  });
});

// ---------------------------------------------------------------------------
// InternalAuthBootstrapJsonCodec
// ---------------------------------------------------------------------------

describe("InternalAuthBootstrapJsonCodec", () => {
  const codec = new InternalAuthBootstrapJsonCodec();

  it("serialize+deserialize round-trips a full object", () => {
    const bootstrap = {
      authConfig: { sessionSecret: "s3cr3t" } as never,
      credentialsEnabled: true,
      oauthProviders: [{ id: "github", name: "GitHub" }],
      uiAuthEnabled: true,
    };
    const json = codec.serialize(bootstrap);
    const result = codec.deserialize(json);
    expect(result).toBeDefined();
    expect(result!.credentialsEnabled).toBe(true);
    expect(result!.oauthProviders).toHaveLength(1);
    expect(result!.uiAuthEnabled).toBe(true);
  });

  it("deserialize returns null for empty/undefined input", () => {
    expect(codec.deserialize("")).toBeNull();
    expect(codec.deserialize(undefined)).toBeNull();
  });

  it("deserialize returns null for malformed JSON", () => {
    expect(codec.deserialize("{bad")).toBeNull();
  });

  it("deserialize returns null for non-object JSON", () => {
    expect(codec.deserialize("null")).toBeNull();
    expect(codec.deserialize("42")).toBeNull();
  });

  it("deserialize sets authConfig undefined when not an object", () => {
    const result = codec.deserialize(JSON.stringify({ authConfig: "string-val", credentialsEnabled: true }));
    expect(result!.authConfig).toBeUndefined();
  });

  it("deserialize defaults uiAuthEnabled to true when omitted", () => {
    const result = codec.deserialize(JSON.stringify({ credentialsEnabled: false }));
    expect(result!.uiAuthEnabled).toBe(true);
  });

  it("deserialize filters invalid oauth provider entries", () => {
    const raw = JSON.stringify({
      oauthProviders: [{ id: "google", name: "Google" }, { id: 99, name: "Bad" }, null],
    });
    const result = codec.deserialize(raw);
    expect(result!.oauthProviders).toHaveLength(1);
    expect(result!.oauthProviders[0].id).toBe("google");
  });

  it("deserialize returns empty oauthProviders when field is not an array", () => {
    const result = codec.deserialize(JSON.stringify({ oauthProviders: "not-array" }));
    expect(result!.oauthProviders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CodemationFrontendAuthSnapshotJsonCodec
// ---------------------------------------------------------------------------

describe("CodemationFrontendAuthSnapshotJsonCodec", () => {
  const codec = new CodemationFrontendAuthSnapshotJsonCodec();

  it("serialize+deserialize round-trips a full object", () => {
    const snapshot = {
      config: { kind: "basic" } as never,
      credentialsEnabled: true,
      oauthProviders: [{ id: "github", name: "GitHub" }],
      secret: "my-secret",
      uiAuthEnabled: true,
    };
    const json = codec.serialize(snapshot);
    const result = codec.deserialize(json);
    expect(result).toBeDefined();
    expect(result!.secret).toBe("my-secret");
    expect(result!.credentialsEnabled).toBe(true);
    expect(result!.oauthProviders).toHaveLength(1);
  });

  it("deserialize returns null for empty/undefined input", () => {
    expect(codec.deserialize("")).toBeNull();
    expect(codec.deserialize(undefined)).toBeNull();
  });

  it("deserialize returns null for malformed JSON", () => {
    expect(codec.deserialize("{bad json")).toBeNull();
  });

  it("deserialize returns null for JSON null", () => {
    expect(codec.deserialize("null")).toBeNull();
  });

  it("deserialize sets secret null when missing or empty", () => {
    const result = codec.deserialize(JSON.stringify({ credentialsEnabled: false }));
    expect(result!.secret).toBeNull();
  });

  it("deserialize defaults uiAuthEnabled to true when omitted", () => {
    const result = codec.deserialize(JSON.stringify({ credentialsEnabled: false }));
    expect(result!.uiAuthEnabled).toBe(true);
  });

  it("deserialize sets config undefined when not an object", () => {
    const result = codec.deserialize(JSON.stringify({ config: "not-object", credentialsEnabled: false }));
    expect(result!.config).toBeUndefined();
  });

  it("deserialize filters invalid oauth provider entries", () => {
    const raw = JSON.stringify({
      oauthProviders: [
        { id: "github", name: "GitHub" },
        { id: 99, name: "Bad" },
        null,
        { id: "valid" }, // missing name
      ],
    });
    const result = codec.deserialize(raw);
    expect(result!.oauthProviders).toHaveLength(1);
    expect(result!.oauthProviders[0].id).toBe("github");
  });

  it("deserialize returns empty oauthProviders when field is not an array", () => {
    const result = codec.deserialize(JSON.stringify({ oauthProviders: {} }));
    expect(result!.oauthProviders).toHaveLength(0);
  });
});

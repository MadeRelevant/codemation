/**
 * Behavioral tests for CredentialRuntimeMaterialService.
 * Tests the compose logic for db, env, and code credential kinds with and without OAuth2 material.
 */
import { describe, expect, it } from "vitest";
import { CredentialRuntimeMaterialService } from "../../src/domain/credentials/CredentialRuntimeMaterialService";
import { CredentialTypeRegistryImpl } from "../../src/domain/credentials/CredentialServices";
import { CredentialSecretCipher } from "../../src/domain/credentials/CredentialSecretCipher";
import { CredentialMaterialResolver } from "../../src/domain/credentials/CredentialMaterialResolver";
import { FakeLoggerFactory } from "../testkit/LoggerTestKit";

function makeSecretCipher() {
  return {
    encrypt: (data: Record<string, unknown>) => ({
      encryptedJson: JSON.stringify(data),
      encryptionKeyId: "key-1",
      schemaVersion: "1",
    }),
    decrypt: (material: { encryptedJson: string }) => JSON.parse(material.encryptedJson) as Record<string, unknown>,
  } as unknown as CredentialSecretCipher;
}

function makeCredentialStore(
  opts: {
    secretMaterial?: Record<string, unknown>;
    oauth2Material?: Record<string, unknown> | null;
  } = {},
) {
  const _cipher = makeSecretCipher();
  return {
    getSecretMaterial: async () =>
      opts.secretMaterial
        ? {
            instanceId: "inst-1",
            encryptedJson: JSON.stringify(opts.secretMaterial),
            encryptionKeyId: "key-1",
            schemaVersion: "1",
            updatedAt: new Date().toISOString(),
          }
        : undefined,
    getOAuth2Material: async () => {
      if (opts.oauth2Material === undefined) return null;
      if (opts.oauth2Material === null) return null;
      return {
        instanceId: "inst-1",
        providerId: "google",
        connectedEmail: "user@example.com",
        connectedAt: new Date().toISOString(),
        scopes: ["email"],
        updatedAt: new Date().toISOString(),
        encryptedJson: JSON.stringify(opts.oauth2Material),
        encryptionKeyId: "key-1",
        schemaVersion: "1",
      };
    },
  };
}

function makeRegistry(auth?: { kind: string }) {
  const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
  registry.merge("plugin", [
    {
      definition: {
        typeId: "test.cred",
        displayName: "Test",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["db"],
        auth: auth as never,
      },
      createSession: async () => ({}),
      test: async () => ({ status: "passing" }),
    } as never,
  ]);
  return registry;
}

describe("CredentialRuntimeMaterialService.compose", () => {
  it("returns base material for non-oauth2 credential type", async () => {
    const store = makeCredentialStore({ secretMaterial: { apiKey: "test-key" } });
    const cipher = makeSecretCipher();
    const appConfig = { env: {} };
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);
    const registry = makeRegistry(); // no auth kind

    const service = new CredentialRuntimeMaterialService(store as never, resolver as never, cipher, registry);

    const instance = {
      instanceId: "inst-1",
      typeId: "test.cred",
      secretRef: { kind: "db" },
    } as never;

    const result = await service.compose(instance);
    expect(result).toEqual({ apiKey: "test-key" });
  });

  it("merges oauth2 material for oauth2 credential type", async () => {
    const store = makeCredentialStore({
      secretMaterial: { clientId: "client-123" },
      oauth2Material: { access_token: "tok-xyz", refresh_token: "ref-abc" },
    });
    const cipher = makeSecretCipher();
    const appConfig = { env: {} };
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);
    const registry = makeRegistry({ kind: "oauth2" });

    const service = new CredentialRuntimeMaterialService(store as never, resolver as never, cipher, registry);

    const instance = {
      instanceId: "inst-1",
      typeId: "test.cred",
      secretRef: { kind: "db" },
    } as never;

    const result = await service.compose(instance);
    // Should have both base material AND oauth2 tokens
    expect(result).toHaveProperty("clientId", "client-123");
    expect(result).toHaveProperty("access_token", "tok-xyz");
  });

  it("returns only base material when oauth2 type has no oauth2 material stored", async () => {
    const store = makeCredentialStore({
      secretMaterial: { clientId: "client-123" },
      oauth2Material: null, // No OAuth2 material
    });
    const cipher = makeSecretCipher();
    const appConfig = { env: {} };
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);
    const registry = makeRegistry({ kind: "oauth2" });

    const service = new CredentialRuntimeMaterialService(store as never, resolver as never, cipher, registry);

    const instance = {
      instanceId: "inst-1",
      typeId: "test.cred",
      secretRef: { kind: "db" },
    } as never;

    const result = await service.compose(instance);
    expect(result).toEqual({ clientId: "client-123" });
    expect(result).not.toHaveProperty("access_token");
  });

  it("returns base material when credential type is unknown", async () => {
    const store = makeCredentialStore({ secretMaterial: { key: "val" } });
    const cipher = makeSecretCipher();
    const appConfig = { env: {} };
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);
    const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory()); // No types registered

    const service = new CredentialRuntimeMaterialService(store as never, resolver as never, cipher, registry);

    const instance = {
      instanceId: "inst-1",
      typeId: "unknown.type",
      secretRef: { kind: "db" },
    } as never;

    const result = await service.compose(instance);
    expect(result).toEqual({ key: "val" });
  });
});

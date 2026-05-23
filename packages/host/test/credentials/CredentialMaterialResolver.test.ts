/**
 * Behavioral tests for CredentialMaterialResolver.
 * Covers all three source kinds: db, env, code.
 */
import { describe, expect, it } from "vitest";
import { CredentialMaterialResolver } from "../../src/domain/credentials/CredentialMaterialResolver";
import { CredentialSecretCipher } from "../../src/domain/credentials/CredentialSecretCipher";

function makeSecretCipher(): CredentialSecretCipher {
  return {
    encrypt: (data: Record<string, unknown>) => ({
      encryptedJson: JSON.stringify(data),
      encryptionKeyId: "key-1",
      schemaVersion: "1",
    }),
    decrypt: (material: { encryptedJson: string }) => JSON.parse(material.encryptedJson) as Record<string, unknown>,
  } as never;
}

function makeCredentialStore(secretMaterial: Record<string, unknown> | null = null) {
  return {
    getSecretMaterial: async () =>
      secretMaterial
        ? {
            instanceId: "inst-1",
            encryptedJson: JSON.stringify(secretMaterial),
            encryptionKeyId: "key-1",
            schemaVersion: "1",
            updatedAt: new Date().toISOString(),
          }
        : undefined,
  };
}

function makeAppConfig(env: Record<string, string> = {}) {
  return { env };
}

function makeDbInstance(secretMaterial: Record<string, unknown> | null = null) {
  const store = makeCredentialStore(secretMaterial);
  const cipher = makeSecretCipher();
  const appConfig = makeAppConfig();
  const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);
  return { resolver };
}

describe("CredentialMaterialResolver.resolveMaterial", () => {
  it("resolves db-backed credentials from encrypted secret material", async () => {
    const { resolver } = makeDbInstance({ apiKey: "secret-value" });
    const instance = {
      instanceId: "inst-1",
      secretRef: { kind: "db" },
    } as never;
    const result = await resolver.resolveMaterial(instance);
    expect(result).toEqual({ apiKey: "secret-value" });
  });

  it("throws when db-backed credential has no secret material", async () => {
    const { resolver } = makeDbInstance(null); // No secret material
    const instance = {
      instanceId: "inst-missing",
      secretRef: { kind: "db" },
    } as never;
    await expect(resolver.resolveMaterial(instance)).rejects.toThrow(/missing encrypted secret material/);
  });

  it("resolves env-backed credentials from environment variables", async () => {
    const store = makeCredentialStore();
    const cipher = makeSecretCipher();
    const appConfig = makeAppConfig({ MY_API_KEY: "env-value" });
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);

    const instance = {
      instanceId: "inst-env",
      secretRef: {
        kind: "env",
        envByField: { apiKey: "MY_API_KEY" },
      },
    } as never;

    const result = await resolver.resolveMaterial(instance);
    expect(result).toEqual({ apiKey: "env-value" });
  });

  it("throws when env-backed credential has missing environment variable", async () => {
    const store = makeCredentialStore();
    const cipher = makeSecretCipher();
    const appConfig = makeAppConfig({}); // Empty env
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);

    const instance = {
      instanceId: "inst-env-missing",
      secretRef: {
        kind: "env",
        envByField: { apiKey: "MISSING_ENV_VAR" },
      },
    } as never;

    await expect(resolver.resolveMaterial(instance)).rejects.toThrow(/environment variables that are not set/);
    await expect(resolver.resolveMaterial(instance)).rejects.toThrow(/MISSING_ENV_VAR/);
  });

  it("throws when env variable is empty string", async () => {
    const store = makeCredentialStore();
    const cipher = makeSecretCipher();
    const appConfig = makeAppConfig({ EMPTY_VAR: "" }); // Empty value
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);

    const instance = {
      instanceId: "inst-env-empty",
      secretRef: {
        kind: "env",
        envByField: { apiKey: "EMPTY_VAR" },
      },
    } as never;

    await expect(resolver.resolveMaterial(instance)).rejects.toThrow(/environment variables that are not set/);
  });

  it("resolves code-backed credentials from inline secretRef.value", async () => {
    const store = makeCredentialStore();
    const cipher = makeSecretCipher();
    const appConfig = makeAppConfig();
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);

    const instance = {
      instanceId: "inst-code",
      secretRef: {
        kind: "code",
        value: { apiKey: "inline-value" },
      },
    } as never;

    const result = await resolver.resolveMaterial(instance);
    expect(result).toEqual({ apiKey: "inline-value" });
  });

  it("resolves env-backed credential with multiple fields", async () => {
    const store = makeCredentialStore();
    const cipher = makeSecretCipher();
    const appConfig = makeAppConfig({ MY_TOKEN: "tok", MY_SECRET: "sec" });
    const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);

    const instance = {
      instanceId: "inst-multi",
      secretRef: {
        kind: "env",
        envByField: { token: "MY_TOKEN", secret: "MY_SECRET" },
      },
    } as never;

    const result = await resolver.resolveMaterial(instance);
    expect(result).toEqual({ token: "tok", secret: "sec" });
  });
});

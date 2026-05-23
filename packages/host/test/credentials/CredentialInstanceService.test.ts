/**
 * Behavioral tests for CredentialInstanceService.
 * Uses InMemoryCredentialStore + stubs for pure-logic behavior tests.
 */
import { describe, expect, it } from "vitest";
import { CredentialInstanceService } from "../../src/domain/credentials/CredentialInstanceService";
import { InMemoryCredentialStore } from "../../src/infrastructure/persistence/CredentialPersistenceStore";
import { CredentialTypeRegistryImpl } from "../../src/domain/credentials/CredentialServices";
import { CredentialSecretCipher } from "../../src/domain/credentials/CredentialSecretCipher";
import { CredentialFieldEnvOverlayService } from "../../src/domain/credentials/CredentialFieldEnvOverlayService";
import { CredentialMaterialResolver } from "../../src/domain/credentials/CredentialMaterialResolver";
import { CredentialOAuth2ScopeResolver } from "../../src/domain/credentials/CredentialOAuth2ScopeResolver";
import { FakeLoggerFactory } from "../testkit/LoggerTestKit";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function makeAppConfig(env: Record<string, string> = {}) {
  return { env };
}

function makeSessionService() {
  const evicted: string[] = [];
  return {
    evictInstance: (id: string) => {
      evicted.push(id);
    },
    getSession: async () => ({}),
    evictBinding: () => {},
    getEvicted: () => evicted,
  };
}

function makeService(
  opts: {
    env?: Record<string, string>;
    types?: { typeId: string; auth?: { kind: string } }[];
  } = {},
) {
  const store = new InMemoryCredentialStore();
  const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
  const cipher = makeSecretCipher();
  const appConfig = makeAppConfig(opts.env ?? {});
  const overlayService = new CredentialFieldEnvOverlayService(appConfig as never);
  const resolver = new CredentialMaterialResolver(store as never, cipher, appConfig as never);
  const scopeResolver = new CredentialOAuth2ScopeResolver();
  const sessionService = makeSessionService();

  // Register any credential types
  for (const type of opts.types ?? []) {
    registry.merge("plugin", [
      {
        definition: {
          typeId: type.typeId,
          displayName: type.typeId,
          publicFields: [],
          secretFields: [],
          supportedSourceKinds: ["db"],
          auth: type.auth ? { ...type.auth, scopes: [], providerId: "test-provider" } : undefined,
        },
        createSession: async () => ({}),
        test: async () => ({ status: "passing" }),
      } as never,
    ]);
  }

  const service = new CredentialInstanceService(
    store as never,
    registry,
    cipher,
    overlayService,
    resolver,
    scopeResolver,
    sessionService as never,
  );

  return { service, store, registry, sessionService };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("CredentialInstanceService.listInstances", () => {
  it("returns empty array when no instances", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const result = await service.listInstances();
    expect(result).toHaveLength(0);
  });
});

describe("CredentialInstanceService.getInstance", () => {
  it("returns undefined for unknown instance", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const result = await service.getInstance("unknown" as never);
    expect(result).toBeUndefined();
  });
});

describe("CredentialInstanceService.getInstanceWithSecrets", () => {
  it("returns undefined for unknown instance", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const result = await service.getInstanceWithSecrets("unknown" as never);
    expect(result).toBeUndefined();
  });
});

describe("CredentialInstanceService.create", () => {
  it("throws 400 when typeId is unknown", async () => {
    const { service } = makeService();
    await expect(
      service.create({
        typeId: "unknown.type" as never,
        displayName: "Test",
        sourceKind: "db",
        publicConfig: {},
        secretConfig: {},
        envSecretRefs: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when displayName is empty", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    await expect(
      service.create({
        typeId: "test.cred" as never,
        displayName: "  ",
        sourceKind: "db",
        publicConfig: {},
        secretConfig: {},
        envSecretRefs: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("creates db-backed credential and evicts session", async () => {
    const { service, sessionService } = makeService({ types: [{ typeId: "test.cred" }] });
    const instance = await service.create({
      typeId: "test.cred" as never,
      displayName: "My Credential",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    expect(instance.instanceId).toBeDefined();
    expect(instance.displayName).toBe("My Credential");
    expect(instance.typeId).toBe("test.cred");
    expect(instance.setupStatus).toBe("ready"); // non-oauth2
    expect(sessionService.getEvicted()).toContain(instance.instanceId);
  });

  it("creates code-backed credential", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const instance = await service.create({
      typeId: "test.cred" as never,
      displayName: "Code Credential",
      sourceKind: "code",
      publicConfig: {},
      secretConfig: { apiKey: "inline-key" },
      envSecretRefs: {},
    });
    expect(instance.sourceKind).toBe("code");
  });

  it("creates env-backed credential", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const instance = await service.create({
      typeId: "test.cred" as never,
      displayName: "Env Credential",
      sourceKind: "env",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    expect(instance.sourceKind).toBe("env");
  });

  it("sets setupStatus=draft for oauth2 credential type", async () => {
    const { service } = makeService({
      types: [{ typeId: "test.oauth2", auth: { kind: "oauth2" } }],
    });
    const instance = await service.create({
      typeId: "test.oauth2" as never,
      displayName: "OAuth Credential",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    expect(instance.setupStatus).toBe("draft");
  });

  it("sets optional tags from request", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const instance = await service.create({
      typeId: "test.cred" as never,
      displayName: "Tagged Credential",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
      tags: ["tag-a", "tag-b"],
    });
    expect(instance.tags).toContain("tag-a");
    expect(instance.tags).toContain("tag-b");
  });
});

describe("CredentialInstanceService.update", () => {
  it("throws 404 when updating unknown instance", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    await expect(service.update("unknown" as never, { displayName: "New Name" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("updates displayName of existing credential", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const created = await service.create({
      typeId: "test.cred" as never,
      displayName: "Original Name",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    const updated = await service.update(created.instanceId, { displayName: "New Name" });
    expect(updated.displayName).toBe("New Name");
  });

  it("updates secretConfig when provided", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const created = await service.create({
      typeId: "test.cred" as never,
      displayName: "Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    const updated = await service.update(created.instanceId, {
      secretConfig: { newKey: "new-value" },
    });
    expect(updated.instanceId).toBe(created.instanceId);
  });

  it("updates setupStatus when provided", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const created = await service.create({
      typeId: "test.cred" as never,
      displayName: "Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    const updated = await service.update(created.instanceId, { setupStatus: "ready" });
    expect(updated.setupStatus).toBe("ready");
  });
});

describe("CredentialInstanceService.delete", () => {
  it("deletes existing credential and evicts session", async () => {
    const { service, store, sessionService } = makeService({ types: [{ typeId: "test.cred" }] });
    const created = await service.create({
      typeId: "test.cred" as never,
      displayName: "Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    await service.delete(created.instanceId);
    const result = await store.getInstance(created.instanceId);
    expect(result).toBeUndefined();
    expect(sessionService.getEvicted()).toContain(created.instanceId);
  });
});

describe("CredentialInstanceService.disconnectOAuth2", () => {
  it("throws 404 when instance not found", async () => {
    const { service } = makeService({ types: [{ typeId: "test.oauth2", auth: { kind: "oauth2" } }] });
    await expect(service.disconnectOAuth2("unknown" as never)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when instance does not use OAuth2", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const created = await service.create({
      typeId: "test.cred" as never,
      displayName: "Plain Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    await expect(service.disconnectOAuth2(created.instanceId)).rejects.toMatchObject({ status: 400 });
  });

  it("disconnects OAuth2 and sets setupStatus=draft", async () => {
    const { service } = makeService({
      types: [{ typeId: "test.oauth2", auth: { kind: "oauth2" } }],
    });
    const created = await service.create({
      typeId: "test.oauth2" as never,
      displayName: "OAuth Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    // Manually set setup status to 'ready' to simulate a connected credential
    await service.update(created.instanceId, { setupStatus: "ready" });

    const result = await service.disconnectOAuth2(created.instanceId);
    expect(result.setupStatus).toBe("draft");
  });
});

describe("CredentialInstanceService.requireInstance", () => {
  it("throws 404 when instance not found", async () => {
    const { service } = makeService();
    await expect(service.requireInstance("nonexistent" as never)).rejects.toMatchObject({ status: 404 });
  });

  it("returns instance when found", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const created = await service.create({
      typeId: "test.cred" as never,
      displayName: "Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    const found = await service.requireInstance(created.instanceId);
    expect(found.instanceId).toBe(created.instanceId);
  });
});

describe("CredentialInstanceService.markOAuth2Connected", () => {
  it("updates setupStatus to ready and evicts session", async () => {
    const { service, sessionService } = makeService({
      types: [{ typeId: "test.oauth2", auth: { kind: "oauth2" } }],
    });
    const created = await service.create({
      typeId: "test.oauth2" as never,
      displayName: "OAuth Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: {},
      envSecretRefs: {},
    });
    expect(created.setupStatus).toBe("draft");

    await service.markOAuth2Connected(created.instanceId, new Date().toISOString());
    const after = await service.getInstance(created.instanceId);
    expect(after?.setupStatus).toBe("ready");
    expect(sessionService.getEvicted()).toContain(created.instanceId);
  });
});

describe("CredentialInstanceService.getInstanceWithSecrets", () => {
  it("returns instance with secretConfig when available", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    const created = await service.create({
      typeId: "test.cred" as never,
      displayName: "Secret Cred",
      sourceKind: "db",
      publicConfig: {},
      secretConfig: { apiKey: "my-secret-key" },
      envSecretRefs: {},
    });
    const withSecrets = await service.getInstanceWithSecrets(created.instanceId);
    expect(withSecrets).toBeDefined();
    expect(withSecrets?.secretConfig).toHaveProperty("apiKey", "my-secret-key");
  });
});

describe("CredentialInstanceService — listInstances with an existing credential", () => {
  it("returns list with one instance after create", async () => {
    const { service } = makeService({ types: [{ typeId: "test.cred" }] });
    await service.create({
      typeId: "test.cred" as never,
      displayName: "Listed Cred",
      sourceKind: "code",
      publicConfig: {},
      secretConfig: { key: "val" },
      envSecretRefs: {},
    });
    const list = await service.listInstances();
    expect(list).toHaveLength(1);
    expect(list[0].displayName).toBe("Listed Cred");
  });
});

import { describe, expect, it } from "vitest";
import { InMemoryCredentialStore } from "../../src/infrastructure/persistence/CredentialPersistenceStore";
import type {
  CredentialInstanceRecord,
  CredentialOAuth2StateRecord,
} from "../../src/domain/credentials/CredentialServices";

function makeInstance(instanceId: string, typeId = "test.cred"): CredentialInstanceRecord {
  return {
    instanceId,
    typeId,
    displayName: `Instance ${instanceId}`,
    publicConfig: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as CredentialInstanceRecord;
}

describe("InMemoryCredentialStore", () => {
  it("listInstances returns empty array initially", async () => {
    const store = new InMemoryCredentialStore();
    const result = await store.listInstances();
    expect(result).toHaveLength(0);
  });

  it("getInstance returns undefined for unknown id", async () => {
    const store = new InMemoryCredentialStore();
    expect(await store.getInstance("missing")).toBeUndefined();
  });

  it("saveInstance stores and retrieves an instance", async () => {
    const store = new InMemoryCredentialStore();
    const instance = makeInstance("inst-1");
    await store.saveInstance({ instance });
    const retrieved = await store.getInstance("inst-1");
    expect(retrieved).toEqual(instance);
  });

  it("saveInstance stores secret material alongside instance", async () => {
    const store = new InMemoryCredentialStore();
    const instance = makeInstance("inst-2");
    const secretMaterial = {
      instanceId: "inst-2",
      encryptedJson: "abc",
      encryptionKeyId: "k1",
      schemaVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await store.saveInstance({ instance, secretMaterial });
    const material = await store.getSecretMaterial("inst-2");
    expect(material).toEqual(secretMaterial);
  });

  it("getSecretMaterial returns undefined when not set", async () => {
    const store = new InMemoryCredentialStore();
    await store.saveInstance({ instance: makeInstance("inst-3") });
    expect(await store.getSecretMaterial("inst-3")).toBeUndefined();
  });

  it("deleteInstance removes instance, secret material, and bindings", async () => {
    const store = new InMemoryCredentialStore();
    const instance = makeInstance("inst-del");
    const secretMaterial = {
      instanceId: "inst-del",
      encryptedJson: "x",
      encryptionKeyId: "k1",
      schemaVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await store.saveInstance({ instance, secretMaterial });
    await store.upsertBinding({
      key: { workflowId: "wf-1", nodeId: "n-1", slotKey: "s" },
      instanceId: "inst-del",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    await store.deleteInstance("inst-del");
    expect(await store.getInstance("inst-del")).toBeUndefined();
    expect(await store.getSecretMaterial("inst-del")).toBeUndefined();
    const bindings = await store.listBindingsByWorkflowId("wf-1");
    expect(bindings).toHaveLength(0);
  });

  it("deleteInstance removes OAuth2 state records linked to that instance", async () => {
    const store = new InMemoryCredentialStore();
    const instance = makeInstance("inst-oauth");
    await store.saveInstance({ instance });
    const oauthState: CredentialOAuth2StateRecord = {
      state: "state-abc",
      instanceId: "inst-oauth",
      providerId: "github",
      requestedScopes: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
    };
    await store.createOAuth2State(oauthState);
    await store.deleteInstance("inst-oauth");
    // state should be cleaned up
    expect(await store.consumeOAuth2State("state-abc")).toBeUndefined();
  });

  it("createOAuth2State and consumeOAuth2State round-trip (consume removes state)", async () => {
    const store = new InMemoryCredentialStore();
    const record: CredentialOAuth2StateRecord = {
      state: "state-xyz",
      instanceId: "inst-oauth-2",
      providerId: "github",
      requestedScopes: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
    };
    await store.createOAuth2State(record);
    const consumed = await store.consumeOAuth2State("state-xyz");
    expect(consumed).toEqual(record);
    // Consuming again returns undefined
    expect(await store.consumeOAuth2State("state-xyz")).toBeUndefined();
  });

  it("consumeOAuth2State returns undefined for unknown state", async () => {
    const store = new InMemoryCredentialStore();
    expect(await store.consumeOAuth2State("nonexistent")).toBeUndefined();
  });

  it("getOAuth2Material returns undefined when not saved", async () => {
    const store = new InMemoryCredentialStore();
    expect(await store.getOAuth2Material("inst-none")).toBeUndefined();
  });

  it("saveOAuth2Material and getOAuth2Material round-trip", async () => {
    const store = new InMemoryCredentialStore();
    await store.saveOAuth2Material({
      instanceId: "inst-m1",
      encryptedJson: "json-encrypted",
      encryptionKeyId: "key-1",
      schemaVersion: 2,
      metadata: {
        providerId: "github",
        connectedEmail: "user@example.com",
        connectedAt: "2026-01-01T00:00:00.000Z",
        scopes: ["repo"],
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    });
    const material = await store.getOAuth2Material("inst-m1");
    expect(material).toBeDefined();
    expect(material!.encryptedJson).toBe("json-encrypted");
    expect(material!.providerId).toBe("github");
    expect(material!.scopes).toEqual(["repo"]);
  });

  it("deleteOAuth2Material removes material", async () => {
    const store = new InMemoryCredentialStore();
    await store.saveOAuth2Material({
      instanceId: "inst-del-m",
      encryptedJson: "x",
      encryptionKeyId: "k",
      schemaVersion: 1,
      metadata: {
        providerId: "github",
        connectedEmail: "u@test.com",
        connectedAt: "2026-01-01T00:00:00.000Z",
        scopes: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    await store.deleteOAuth2Material("inst-del-m");
    expect(await store.getOAuth2Material("inst-del-m")).toBeUndefined();
  });

  it("upsertBinding and getBinding round-trip", async () => {
    const store = new InMemoryCredentialStore();
    const bindingKey = { workflowId: "wf-b1", nodeId: "node-1", slotKey: "cred" };
    await store.upsertBinding({
      key: bindingKey,
      instanceId: "inst-b1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const retrieved = await store.getBinding(bindingKey);
    expect(retrieved).toBeDefined();
    expect(retrieved!.instanceId).toBe("inst-b1");
  });

  it("getBinding returns undefined for missing key", async () => {
    const store = new InMemoryCredentialStore();
    expect(await store.getBinding({ workflowId: "wf-x", nodeId: "n", slotKey: "s" })).toBeUndefined();
  });

  it("listBindingsByWorkflowId returns only matching workflow bindings", async () => {
    const store = new InMemoryCredentialStore();
    await store.upsertBinding({
      key: { workflowId: "wf-1", nodeId: "n1", slotKey: "s" },
      instanceId: "i1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    await store.upsertBinding({
      key: { workflowId: "wf-2", nodeId: "n2", slotKey: "s" },
      instanceId: "i2",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const bindings = await store.listBindingsByWorkflowId("wf-1");
    expect(bindings).toHaveLength(1);
    expect(bindings[0].instanceId).toBe("i1");
  });

  it("saveTestResult and getLatestTestResult round-trip", async () => {
    const store = new InMemoryCredentialStore();
    const record = { instanceId: "inst-t1", ok: true, testedAt: "2026-01-01T00:00:00.000Z" } as never;
    await store.saveTestResult(record);
    const retrieved = await store.getLatestTestResult("inst-t1");
    expect(retrieved).toEqual(record);
  });

  it("getLatestTestResult returns undefined for missing instance", async () => {
    const store = new InMemoryCredentialStore();
    expect(await store.getLatestTestResult("missing-inst")).toBeUndefined();
  });

  it("getLatestTestResults returns only known instances", async () => {
    const store = new InMemoryCredentialStore();
    const r1 = { instanceId: "inst-lr1", ok: true, testedAt: "2026-01-01T00:00:00.000Z" } as never;
    await store.saveTestResult(r1);
    const map = await store.getLatestTestResults(["inst-lr1", "inst-unknown"]);
    expect(map.size).toBe(1);
    expect(map.get("inst-lr1")).toEqual(r1);
  });

  it("listInstances returns sorted newest-first by updatedAt", async () => {
    const store = new InMemoryCredentialStore();
    await store.saveInstance({
      instance: { ...makeInstance("old"), updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    await store.saveInstance({
      instance: { ...makeInstance("new"), updatedAt: "2026-06-01T00:00:00.000Z" },
    });
    const results = await store.listInstances();
    expect(results[0].instanceId).toBe("new");
    expect(results[1].instanceId).toBe("old");
  });
});

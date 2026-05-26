import assert from "node:assert/strict";
import { test, describe } from "vitest";
import { Hono } from "hono";
import { InternalCredentialsListRegistrar } from "../../src/credentials/InternalCredentialsListRegistrar";
import type {
  CredentialStore,
  CredentialInstanceRecord,
  CredentialOAuth2MaterialRecord,
} from "../../src/domain/credentials/CredentialServices";

// ── Stubs ─────────────────────────────────────────────────────────────────────

class StubHmacMiddleware {
  handle() {
    return async (_c: unknown, next: () => Promise<void>) => next();
  }
}

function makeInstance(id: string): CredentialInstanceRecord {
  return {
    instanceId: id,
    typeId: "gmail",
    displayName: "My Gmail",
    sourceKind: "db",
    publicConfig: {},
    secretRef: { kind: "db" },
    tags: [],
    setupStatus: "ready",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    material: { source: "local", ref: id },
  };
}

function makeOAuth2Material(instanceId: string): CredentialOAuth2MaterialRecord {
  return {
    instanceId,
    encryptedJson: "ENCRYPTED",
    encryptionKeyId: "key-1",
    schemaVersion: 1,
    providerId: "google",
    connectedEmail: "user@example.com",
    connectedAt: "2025-01-02T00:00:00.000Z",
    scopes: ["gmail.readonly"],
    updatedAt: "2025-01-02T00:00:00.000Z",
  };
}

function makeStore(
  instances: CredentialInstanceRecord[],
  oauth2MaterialByInstanceId: Map<string, CredentialOAuth2MaterialRecord>,
): CredentialStore {
  return {
    listInstances: async () => instances,
    getInstance: async () => undefined,
    saveInstance: async () => {},
    deleteInstance: async () => {},
    getSecretMaterial: async () => undefined,
    createOAuth2State: async () => {},
    consumeOAuth2State: async () => undefined,
    getOAuth2Material: async (id: string) => oauth2MaterialByInstanceId.get(id),
    saveOAuth2Material: async () => {},
    deleteOAuth2Material: async () => {},
    upsertBinding: async () => {},
    getBinding: async () => undefined,
    listBindingsByWorkflowId: async () => [],
    saveTestResult: async () => {},
    getLatestTestResult: async () => undefined,
    getLatestTestResults: async () => new Map(),
  } as unknown as CredentialStore;
}

function buildApp(store: CredentialStore) {
  const registrar = new InternalCredentialsListRegistrar(new StubHmacMiddleware() as never, store);
  const app = new Hono();
  registrar.register(app);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InternalCredentialsListRegistrar — GET /internal/credentials", () => {
  test("returns empty array when no instances exist", async () => {
    const store = makeStore([], new Map());
    const app = buildApp(store);

    const res = await app.request("/internal/credentials", { method: "GET" });

    assert.equal(res.status, 200);
    const body = (await res.json()) as unknown[];
    assert.deepEqual(body, []);
  });

  test("returns instance metadata with oauth2 status when connected", async () => {
    const inst = makeInstance("inst-1");
    const material = makeOAuth2Material("inst-1");
    const store = makeStore([inst], new Map([["inst-1", material]]));
    const app = buildApp(store);

    const res = await app.request("/internal/credentials", { method: "GET" });
    const body = (await res.json()) as Array<Record<string, unknown>>;

    assert.equal(body.length, 1);
    const entry = body[0]!;
    assert.equal(entry.instanceId, "inst-1");
    assert.equal(entry.typeId, "gmail");
    assert.equal(entry.displayName, "My Gmail");
    assert.equal(entry.setupStatus, "ready");

    const oauth2 = entry.oauth2 as Record<string, unknown>;
    assert.equal(oauth2.providerId, "google");
    assert.equal(oauth2.connectedEmail, "user@example.com");
    assert.deepEqual(oauth2.scopes, ["gmail.readonly"]);
  });

  test("returns null oauth2 for instances without OAuth2 material", async () => {
    const inst = makeInstance("inst-2");
    const store = makeStore([inst], new Map());
    const app = buildApp(store);

    const res = await app.request("/internal/credentials", { method: "GET" });
    const body = (await res.json()) as Array<Record<string, unknown>>;

    assert.equal(body.length, 1);
    assert.equal(body[0]!.oauth2, null);
  });

  test("does not include token material in the response", async () => {
    const inst = makeInstance("inst-3");
    const material = makeOAuth2Material("inst-3");
    const store = makeStore([inst], new Map([["inst-3", material]]));
    const app = buildApp(store);

    const res = await app.request("/internal/credentials", { method: "GET" });
    const body = (await res.json()) as Array<Record<string, unknown>>;

    const json = JSON.stringify(body);
    assert.ok(!json.includes("ENCRYPTED"), "response must not contain encryptedJson");
    assert.ok(!json.includes("access_token"), "response must not contain access_token");
    assert.ok(!json.includes("refresh_token"), "response must not contain refresh_token");
  });
});

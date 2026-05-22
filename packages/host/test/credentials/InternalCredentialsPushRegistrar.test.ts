import assert from "node:assert/strict";
import { test, describe } from "vitest";
import { Hono } from "hono";
import { InternalCredentialsPushRegistrar } from "../../src/credentials/InternalCredentialsPushRegistrar";
import type { CredentialStore, CredentialOAuth2MaterialRecord } from "../../src/domain/credentials/CredentialServices";

// ── Minimal stubs ─────────────────────────────────────────────────────────────

class StubHmacMiddleware {
  handle() {
    return async (_c: unknown, next: () => Promise<void>) => next();
  }
}

class StubCredentialSecretCipher {
  encrypt(value: Record<string, unknown>) {
    return { encryptedJson: JSON.stringify(value), encryptionKeyId: "test-key", schemaVersion: 1 };
  }

  decrypt(record: { encryptedJson: string }) {
    return JSON.parse(record.encryptedJson) as Record<string, unknown>;
  }
}

class StubCredentialInstanceService {
  markedConnected: string[] = [];
  async markOAuth2Connected(instanceId: string) {
    this.markedConnected.push(instanceId);
  }
}

function makeStore(existingMaterial?: CredentialOAuth2MaterialRecord): {
  store: CredentialStore;
  saved: Array<Record<string, unknown>>;
} {
  const saved: Array<Record<string, unknown>> = [];
  const store = {
    listInstances: async () => [],
    getInstance: async () => undefined,
    saveInstance: async () => {},
    deleteInstance: async () => {},
    getSecretMaterial: async () => undefined,
    createOAuth2State: async () => {},
    consumeOAuth2State: async () => undefined,
    getOAuth2Material: async () => existingMaterial,
    saveOAuth2Material: async (args: Record<string, unknown>) => {
      saved.push(args);
    },
    deleteOAuth2Material: async () => {},
    upsertBinding: async () => {},
    getBinding: async () => undefined,
    listBindingsByWorkflowId: async () => [],
    saveTestResult: async () => {},
    getLatestTestResult: async () => undefined,
    getLatestTestResults: async () => new Map(),
  } as unknown as CredentialStore;
  return { store, saved };
}

const stubLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const stubLoggerFactory = { create: () => stubLogger };

const stubTestService = { test: async () => ({ status: "healthy" as const }) };

function buildApp(
  store: CredentialStore,
  cipher = new StubCredentialSecretCipher(),
  instanceService = new StubCredentialInstanceService(),
) {
  const registrar = new InternalCredentialsPushRegistrar(
    new StubHmacMiddleware() as never,
    store,
    cipher as never,
    instanceService as never,
    stubTestService as never,
    stubLoggerFactory as never,
  );
  const app = new Hono();
  registrar.register(app);
  return app;
}

async function pushRequest(app: Hono, body: Record<string, unknown>) {
  return app.request("/internal/credentials/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Fixed future timestamp (unix seconds) — avoids nondeterminism from Date.now().
const FUTURE_EXPIRES_AT = 9_999_999_999;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InternalCredentialsPushRegistrar — POST /internal/credentials/push", () => {
  test("saves OAuth2 material on a valid push", async () => {
    const { store, saved } = makeStore();
    const app = buildApp(store);

    const res = await pushRequest(app, {
      credentialInstanceId: "inst-1",
      accessToken: "access-abc",
      refreshToken: "refresh-xyz",
      expiresAt: FUTURE_EXPIRES_AT,
      scopesGranted: ["gmail.readonly"],
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(json.ok, true);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.instanceId, "inst-1");
  });

  test("preserves existing refreshToken when push omits it", async () => {
    const existingEncrypted = JSON.stringify({
      access_token: "old-access",
      refresh_token: "old-refresh",
    });
    const existingMaterial: CredentialOAuth2MaterialRecord = {
      instanceId: "inst-2",
      encryptedJson: existingEncrypted,
      encryptionKeyId: "key-1",
      schemaVersion: 1,
      providerId: "google",
      scopes: ["gmail.readonly"],
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const { store, saved } = makeStore(existingMaterial);
    const cipher = new StubCredentialSecretCipher();
    const app = buildApp(store, cipher);

    await pushRequest(app, {
      credentialInstanceId: "inst-2",
      accessToken: "new-access",
      // refreshToken intentionally omitted (Google re-consent without new refresh token)
      expiresAt: FUTURE_EXPIRES_AT,
      scopesGranted: ["gmail.readonly"],
    });

    assert.equal(saved.length, 1);
    const savedMaterial = JSON.parse(saved[0]!.encryptedJson as string) as Record<string, unknown>;
    assert.equal(savedMaterial.refresh_token, "old-refresh", "should preserve existing refresh token");
    assert.equal(savedMaterial.access_token, "new-access", "should use new access token");
  });

  test("preserves existing refreshToken when push sends null", async () => {
    const existingEncrypted = JSON.stringify({ access_token: "old", refresh_token: "keep-me" });
    const existingMaterial: CredentialOAuth2MaterialRecord = {
      instanceId: "inst-3",
      encryptedJson: existingEncrypted,
      encryptionKeyId: "key-1",
      schemaVersion: 1,
      providerId: "google",
      scopes: [],
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const { store, saved } = makeStore(existingMaterial);
    const app = buildApp(store);

    await pushRequest(app, {
      credentialInstanceId: "inst-3",
      accessToken: "newer-access",
      refreshToken: null,
      expiresAt: FUTURE_EXPIRES_AT,
      scopesGranted: [],
    });

    const savedMaterial = JSON.parse(saved[0]!.encryptedJson as string) as Record<string, unknown>;
    assert.equal(savedMaterial.refresh_token, "keep-me");
  });

  test("returns 400 if credentialInstanceId is missing", async () => {
    const { store } = makeStore();
    const app = buildApp(store);

    const res = await pushRequest(app, {
      accessToken: "access-abc",
      expiresAt: FUTURE_EXPIRES_AT,
      scopesGranted: [],
    });

    assert.equal(res.status, 400);
  });

  test("returns 400 if accessToken is missing", async () => {
    const { store } = makeStore();
    const app = buildApp(store);

    const res = await pushRequest(app, {
      credentialInstanceId: "inst-x",
      expiresAt: FUTURE_EXPIRES_AT,
      scopesGranted: [],
    });

    assert.equal(res.status, 400);
  });
});

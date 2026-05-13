import assert from "node:assert/strict";
import { test, describe } from "vitest";
import {
  RemoteOAuthRefreshDelegate,
  CredentialDisconnectedError,
} from "../../src/credentials/refresh/RemoteOAuthRefreshDelegate";
import type { CredentialStore, CredentialOAuth2MaterialRecord } from "../../src/domain/credentials/CredentialServices";
import type { BrokerRefreshResult } from "../../src/credentials/BrokerClient";
import { BrokerRefreshInvalidGrantError } from "../../src/credentials/BrokerRefreshInvalidGrantError";

// ── Stubs ─────────────────────────────────────────────────────────────────────

const stubLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const stubLoggerFactory = { create: () => stubLogger };

class StubCipher {
  encrypt(value: Record<string, unknown>) {
    return { encryptedJson: JSON.stringify(value), encryptionKeyId: "key", schemaVersion: 1 };
  }

  decrypt(record: { encryptedJson: string }) {
    return JSON.parse(record.encryptedJson) as Record<string, unknown>;
  }
}

// Fixed ISO strings to avoid nondeterminism from Date.now().
const PAST_EXPIRY = "2020-01-01T00:00:00.000Z"; // already expired
const FAR_FUTURE_EXPIRY = "2099-06-01T00:00:00.000Z"; // well in the future

function makeOAuth2Material(overrides: Partial<Record<string, unknown>> = {}): CredentialOAuth2MaterialRecord {
  const tokenData = {
    access_token: "valid-token",
    refresh_token: "refresh-token",
    expiry: FAR_FUTURE_EXPIRY,
    ...overrides,
  };
  return {
    instanceId: "inst-1",
    encryptedJson: JSON.stringify(tokenData),
    encryptionKeyId: "key",
    schemaVersion: 1,
    providerId: "google",
    scopes: ["gmail.readonly"],
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function makeStore(material: CredentialOAuth2MaterialRecord | undefined): {
  store: CredentialStore;
  savedMaterials: Array<Record<string, unknown>>;
} {
  const savedMaterials: Array<Record<string, unknown>> = [];
  const store = {
    listInstances: async () => [],
    getInstance: async () => undefined,
    saveInstance: async () => {},
    deleteInstance: async () => {},
    getSecretMaterial: async () => undefined,
    createOAuth2State: async () => {},
    consumeOAuth2State: async () => undefined,
    getOAuth2Material: async () => material,
    saveOAuth2Material: async (args: Record<string, unknown>) => {
      savedMaterials.push(args);
    },
    deleteOAuth2Material: async () => {},
    upsertBinding: async () => {},
    getBinding: async () => undefined,
    listBindingsByWorkflowId: async () => [],
    saveTestResult: async () => {},
    getLatestTestResult: async () => undefined,
    getLatestTestResults: async () => new Map(),
  } as unknown as CredentialStore;
  return { store, savedMaterials };
}

type RefreshFn = (args: { credentialInstanceId: string; refreshToken: string }) => Promise<BrokerRefreshResult>;

class StubBrokerClient {
  constructor(private readonly refreshFn: RefreshFn) {}
  async refreshCredential(args: { credentialInstanceId: string; refreshToken: string }): Promise<BrokerRefreshResult> {
    return this.refreshFn(args);
  }
}

const FUTURE_EXPIRES_AT_SECONDS = 4_102_444_800; // 2100-01-01 UTC in unix seconds

function makeDelegate(store: CredentialStore, broker: StubBrokerClient) {
  return new RemoteOAuthRefreshDelegate(store, new StubCipher() as never, broker as never, stubLoggerFactory as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RemoteOAuthRefreshDelegate — getAccessToken", () => {
  test("returns stored token when still valid", async () => {
    const { store } = makeStore(makeOAuth2Material({ access_token: "fresh-token", expiry: FAR_FUTURE_EXPIRY }));
    const broker = new StubBrokerClient(() => {
      throw new Error("should not be called");
    });
    const delegate = makeDelegate(store, broker);

    const result = await delegate.getAccessToken("inst-1");
    assert.equal(result.accessToken, "fresh-token");
  });

  test("calls broker when token is expired", async () => {
    const { store, savedMaterials } = makeStore(
      makeOAuth2Material({
        access_token: "old-token",
        expiry: PAST_EXPIRY,
      }),
    );

    let brokerCalled = false;
    const broker = new StubBrokerClient(async () => {
      brokerCalled = true;
      return {
        accessToken: "new-token",
        expiresAt: FUTURE_EXPIRES_AT_SECONDS,
        scopesGranted: ["gmail.readonly"],
      };
    });

    const delegate = makeDelegate(store, broker);
    const result = await delegate.getAccessToken("inst-1");

    assert.equal(brokerCalled, true);
    assert.equal(result.accessToken, "new-token");
    assert.equal(savedMaterials.length, 1, "should persist refreshed material");
  });

  test("calls broker when token is within the 60s buffer window", async () => {
    // 30 seconds from now — inside the 60s buffer, so should refresh.
    // Uses new Date() (allowed) rather than Date.now() (banned in tests).
    const soonExpiry = new Date(new Date().getTime() + 30 * 1000).toISOString();
    const { store } = makeStore(makeOAuth2Material({ access_token: "expiring-token", expiry: soonExpiry }));

    let brokerCalled = false;
    const broker = new StubBrokerClient(async () => {
      brokerCalled = true;
      return {
        accessToken: "refreshed",
        expiresAt: FUTURE_EXPIRES_AT_SECONDS,
        scopesGranted: ["gmail.readonly"],
      };
    });

    const delegate = makeDelegate(store, broker);
    await delegate.getAccessToken("inst-1");
    assert.equal(brokerCalled, true);
  });

  test("throws CredentialDisconnectedError when broker returns invalid_grant", async () => {
    const { store } = makeStore(makeOAuth2Material({ expiry: PAST_EXPIRY }));

    const broker = new StubBrokerClient(async (args) => {
      throw new BrokerRefreshInvalidGrantError(args.credentialInstanceId);
    });

    const delegate = makeDelegate(store, broker);
    await assert.rejects(
      () => delegate.getAccessToken("inst-1"),
      (err: Error) => err instanceof CredentialDisconnectedError,
    );
  });

  test("single-flight: concurrent calls issue only one broker request", async () => {
    const { store } = makeStore(makeOAuth2Material({ expiry: PAST_EXPIRY }));

    let brokerCallCount = 0;
    const broker = new StubBrokerClient(async () => {
      brokerCallCount++;
      // Simulate async work
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      return {
        accessToken: "deduped-token",
        expiresAt: FUTURE_EXPIRES_AT_SECONDS,
        scopesGranted: [],
      };
    });

    const delegate = makeDelegate(store, broker);
    const [r1, r2, r3] = await Promise.all([
      delegate.getAccessToken("inst-1"),
      delegate.getAccessToken("inst-1"),
      delegate.getAccessToken("inst-1"),
    ]);

    assert.equal(brokerCallCount, 1, "broker should only be called once");
    assert.equal(r1.accessToken, "deduped-token");
    assert.equal(r2.accessToken, "deduped-token");
    assert.equal(r3.accessToken, "deduped-token");
  });

  test("throws when no OAuth2 material exists", async () => {
    const { store } = makeStore(undefined);
    const broker = new StubBrokerClient(async () => {
      throw new Error("unreachable");
    });
    const delegate = makeDelegate(store, broker);

    await assert.rejects(() => delegate.getAccessToken("inst-missing"), /No OAuth2 material found/);
  });

  test("uses rotated refreshToken returned by broker", async () => {
    const { store, savedMaterials } = makeStore(
      makeOAuth2Material({
        access_token: "old",
        refresh_token: "old-refresh",
        expiry: PAST_EXPIRY,
      }),
    );

    const broker = new StubBrokerClient(async () => ({
      accessToken: "fresh",
      expiresAt: FUTURE_EXPIRES_AT_SECONDS,
      scopesGranted: [],
      refreshToken: "rotated-refresh",
    }));

    const delegate = makeDelegate(store, broker);
    await delegate.getAccessToken("inst-1");

    const saved = JSON.parse(savedMaterials[0]!.encryptedJson as string) as Record<string, unknown>;
    assert.equal(saved.refresh_token, "rotated-refresh", "should use the rotated refresh token");
  });

  test("preserves existing refreshToken when broker does not return one", async () => {
    const { store, savedMaterials } = makeStore(
      makeOAuth2Material({
        access_token: "old",
        refresh_token: "keep-this",
        expiry: PAST_EXPIRY,
      }),
    );

    const broker = new StubBrokerClient(async () => ({
      accessToken: "fresh",
      expiresAt: FUTURE_EXPIRES_AT_SECONDS,
      scopesGranted: [],
      // refreshToken intentionally absent
    }));

    const delegate = makeDelegate(store, broker);
    await delegate.getAccessToken("inst-1");

    const saved = JSON.parse(savedMaterials[0]!.encryptedJson as string) as Record<string, unknown>;
    assert.equal(saved.refresh_token, "keep-this");
  });
});

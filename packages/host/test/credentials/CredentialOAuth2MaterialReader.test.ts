import { describe, expect, it } from "vitest";
import type { Clock, OAuthFlowExecutor, OAuthMaterial } from "@codemation/core";

import { CredentialOAuth2MaterialReader } from "../../src/credentials/CredentialOAuth2MaterialReader";
import type { CredentialSecretCipher } from "../../src/domain/credentials/CredentialSecretCipher";
import type {
  CredentialInstanceRecord,
  CredentialOAuth2MaterialRecord,
  CredentialStore,
} from "../../src/domain/credentials/CredentialServices";
import { FakeLoggerFactory } from "../testkit";

function makeRecord(): CredentialOAuth2MaterialRecord {
  return {
    instanceId: "inst-1",
    encryptedJson: "ciphertext",
    encryptionKeyId: "k1",
    schemaVersion: 1,
    providerId: "local",
    connectedAt: "2026-05-23T11:00:00.000Z",
    scopes: ["scope-a"],
    updatedAt: "2026-05-23T11:00:00.000Z",
  };
}

function makeInstance(): CredentialInstanceRecord {
  return {
    instanceId: "inst-1",
    typeId: "oauth.google.gmail",
    displayName: "Test",
    sourceKind: "db",
    publicConfig: {},
    secretRef: { kind: "db" },
    tags: [],
    setupStatus: "ready",
    createdAt: "2026-05-23T10:00:00.000Z",
    updatedAt: "2026-05-23T10:00:00.000Z",
    material: { source: "local", ref: "inst-1" },
  } satisfies CredentialInstanceRecord;
}

class FakeClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
}

class FakeStore {
  record: CredentialOAuth2MaterialRecord | undefined = makeRecord();
  saved: Array<{
    instanceId: string;
    encryptedJson: string;
    metadata: { scopes: ReadonlyArray<string>; updatedAt: string };
  }> = [];

  async getOAuth2Material(): Promise<CredentialOAuth2MaterialRecord | undefined> {
    return this.record;
  }
  async getInstance(): Promise<CredentialInstanceRecord> {
    return makeInstance();
  }
  async saveOAuth2Material(args: {
    instanceId: string;
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
    metadata: { scopes: ReadonlyArray<string>; updatedAt: string };
  }): Promise<void> {
    this.saved.push({
      instanceId: args.instanceId,
      encryptedJson: args.encryptedJson,
      metadata: args.metadata,
    });
  }
}

class FakeCipher {
  decryptedMaterial: { accessToken: string; refreshToken?: string; expiresAt?: string; grantedScopes: string } = {
    accessToken: "old-token",
    refreshToken: "rt-1",
    expiresAt: "2026-05-23T12:00:00.000Z",
    grantedScopes: "scope-a",
  };
  encrypted: Array<Record<string, unknown>> = [];

  decrypt(_record: unknown): Record<string, unknown> {
    return { ...this.decryptedMaterial };
  }
  encrypt(plain: Record<string, unknown>): {
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
  } {
    this.encrypted.push(plain);
    return { encryptedJson: "ciphertext-v2", encryptionKeyId: "k1", schemaVersion: 1 };
  }
}

class FakeExecutor {
  calls = 0;
  refreshedMaterial: OAuthMaterial = {
    accessToken: "new-token",
    refreshToken: "rt-1",
    expiresAt: "2026-05-23T14:00:00.000Z",
    grantedScopes: ["scope-a"],
  };
  failNext = false;

  async refresh(): Promise<OAuthMaterial> {
    this.calls++;
    if (this.failNext) {
      this.failNext = false;
      throw new Error("refresh exploded");
    }
    // simulate latency so concurrent reads can race against the single-flight gate
    await new Promise((r) => setTimeout(r, 5));
    return this.refreshedMaterial;
  }
  // unused interface methods
  async start(): Promise<never> {
    throw new Error("not used");
  }
  lookupInstanceId(): undefined {
    return undefined;
  }
  async completeCallback(): Promise<never> {
    throw new Error("not used");
  }
}

function build(now: string = "2026-05-23T11:30:00.000Z"): {
  reader: CredentialOAuth2MaterialReader;
  store: FakeStore;
  cipher: FakeCipher;
  executor: FakeExecutor;
  clock: FakeClock;
} {
  const store = new FakeStore();
  const cipher = new FakeCipher();
  const executor = new FakeExecutor();
  const clock = new FakeClock(new Date(now));
  const reader = new CredentialOAuth2MaterialReader(
    store as unknown as CredentialStore,
    cipher as unknown as CredentialSecretCipher,
    executor as unknown as OAuthFlowExecutor,
    clock,
    new FakeLoggerFactory(),
  );
  return { reader, store, cipher, executor, clock };
}

describe("CredentialOAuth2MaterialReader", () => {
  it("returns the stored token unchanged when expiry is comfortably in the future", async () => {
    // Token expires at 12:00; clock at 11:30 → 30 min headroom, well past the 60s refresh lead.
    const { reader, executor } = build("2026-05-23T11:30:00.000Z");

    const material = await reader.readMaterial("inst-1");

    expect(material.accessToken).toBe("old-token");
    expect(executor.calls).toBe(0);
  });

  it("refreshes when the token is past its expiry", async () => {
    // Token expires at 12:00; clock at 12:05 → expired.
    const { reader, executor, store } = build("2026-05-23T12:05:00.000Z");

    const material = await reader.readMaterial("inst-1");

    expect(material.accessToken).toBe("new-token");
    expect(executor.calls).toBe(1);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]!.encryptedJson).toBe("ciphertext-v2");
  });

  it("refreshes proactively when expiry is within the 60-second lead window", async () => {
    // Token expires at 12:00; clock at 11:59:30 → 30s of headroom, inside the 60s lead.
    const { reader, executor } = build("2026-05-23T11:59:30.000Z");

    await reader.readMaterial("inst-1");

    expect(executor.calls).toBe(1);
  });

  it("single-flights concurrent reads so the refresh_token is not exchanged twice in parallel", async () => {
    const { reader, executor } = build("2026-05-23T12:05:00.000Z");

    const [a, b, c] = await Promise.all([
      reader.readMaterial("inst-1"),
      reader.readMaterial("inst-1"),
      reader.readMaterial("inst-1"),
    ]);

    expect(executor.calls).toBe(1);
    expect(a.accessToken).toBe("new-token");
    expect(b.accessToken).toBe("new-token");
    expect(c.accessToken).toBe("new-token");
  });

  it("falls back to the stale material when refresh throws (lets the caller surface the real downstream 401)", async () => {
    const { reader, executor } = build("2026-05-23T12:05:00.000Z");
    executor.failNext = true;

    const material = await reader.readMaterial("inst-1");

    expect(material.accessToken).toBe("old-token");
    expect(executor.calls).toBe(1);
  });

  it("does not attempt refresh when there is no refresh_token", async () => {
    const { reader, cipher, executor } = build("2026-05-23T12:05:00.000Z");
    cipher.decryptedMaterial = { accessToken: "old-token", grantedScopes: "scope-a" };

    const material = await reader.readMaterial("inst-1");

    expect(executor.calls).toBe(0);
    expect(material.accessToken).toBe("old-token");
  });

  it("throws when the instance has never been connected (no material at all)", async () => {
    const { reader, store } = build();
    store.record = undefined;

    await expect(reader.readMaterial("inst-1")).rejects.toThrow(/has no OAuth2 material/);
  });
});

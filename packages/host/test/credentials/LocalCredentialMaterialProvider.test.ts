import { describe, expect, it } from "vitest";
import type { CallerContext, CredentialMaterialRef } from "@codemation/core";
import { IllegalMaterialSourceError } from "@codemation/core";

import { LocalCredentialMaterialProvider } from "../../src/credentials/LocalCredentialMaterialProvider";
import type { CredentialSecretCipher } from "../../src/domain/credentials/CredentialSecretCipher";
import type {
  CredentialOAuth2MaterialMetadata,
  CredentialOAuth2MaterialRecord,
  CredentialStore,
} from "../../src/domain/credentials/CredentialServices";

function makeRecord(instanceId: string): CredentialOAuth2MaterialRecord {
  return {
    instanceId,
    encryptedJson: "ciphertext",
    encryptionKeyId: "k1",
    schemaVersion: 1,
    providerId: "test.provider",
    connectedEmail: "alice@example.com",
    connectedAt: "2026-05-23T11:00:00.000Z",
    scopes: ["scope-a", "scope-b"],
    updatedAt: "2026-05-23T11:00:00.000Z",
  };
}

class FakeStore {
  record: CredentialOAuth2MaterialRecord | undefined;
  saved: Array<{
    instanceId: string;
    encryptedJson: string;
    metadata: CredentialOAuth2MaterialMetadata;
  }> = [];

  constructor(initial?: CredentialOAuth2MaterialRecord) {
    this.record = initial;
  }

  async getOAuth2Material(): Promise<CredentialOAuth2MaterialRecord | undefined> {
    return this.record;
  }

  async saveOAuth2Material(args: {
    instanceId: string;
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
    metadata: CredentialOAuth2MaterialMetadata;
  }): Promise<void> {
    this.saved.push({
      instanceId: args.instanceId,
      encryptedJson: args.encryptedJson,
      metadata: args.metadata,
    });
  }
}

class FakeCipher {
  decryptedPayload: Record<string, unknown> = {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: "2026-05-23T12:00:00.000Z",
    grantedScopes: "scope-a scope-b",
  };
  encrypted: Array<Record<string, unknown>> = [];

  decrypt(_record: unknown): Record<string, unknown> {
    return { ...this.decryptedPayload };
  }

  encrypt(plain: Record<string, unknown>): {
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
  } {
    this.encrypted.push(plain);
    return { encryptedJson: "ciphertext-out", encryptionKeyId: "k1", schemaVersion: 2 };
  }
}

const callerContext: CallerContext = {
  workspaceId: "<unknown>",
  caller: { kind: "manual", userId: "<unknown>" },
};

function makeProvider(store: FakeStore, cipher: FakeCipher): LocalCredentialMaterialProvider {
  return new LocalCredentialMaterialProvider(
    store as unknown as CredentialStore,
    cipher as unknown as CredentialSecretCipher,
  );
}

describe("LocalCredentialMaterialProvider", () => {
  it("getMaterial returns decrypted OAuth bundle for a local ref", async () => {
    const store = new FakeStore(makeRecord("inst-1"));
    const cipher = new FakeCipher();
    const provider = makeProvider(store, cipher);

    const ref: CredentialMaterialRef = { source: "local", id: "inst-1" };
    const bundle = await provider.getMaterial(ref, callerContext);

    expect(bundle).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: "2026-05-23T12:00:00.000Z",
      grantedScopes: ["scope-a", "scope-b"],
    });
  });

  it("getMaterial falls back to row scopes when grantedScopes string is absent", async () => {
    const store = new FakeStore(makeRecord("inst-1"));
    const cipher = new FakeCipher();
    cipher.decryptedPayload = { accessToken: "a", refreshToken: "r" };
    const provider = makeProvider(store, cipher);

    const bundle = await provider.getMaterial({ source: "local", id: "inst-1" }, callerContext);
    expect(bundle.grantedScopes).toEqual(["scope-a", "scope-b"]);
  });

  it("getMaterial throws when no material row exists", async () => {
    const store = new FakeStore(undefined);
    const cipher = new FakeCipher();
    const provider = makeProvider(store, cipher);

    await expect(provider.getMaterial({ source: "local", id: "missing" }, callerContext)).rejects.toThrow(
      /no material/,
    );
  });

  it("getMaterial throws IllegalMaterialSourceError for control-plane refs", async () => {
    const provider = makeProvider(new FakeStore(), new FakeCipher());
    await expect(provider.getMaterial({ source: "control-plane", id: "cp-1" }, callerContext)).rejects.toBeInstanceOf(
      IllegalMaterialSourceError,
    );
  });

  it("setMaterial encrypts the bundle and persists scopes", async () => {
    const store = new FakeStore(makeRecord("inst-1"));
    const cipher = new FakeCipher();
    const provider = makeProvider(store, cipher);

    await provider.setMaterial(
      { source: "local", id: "inst-1" },
      {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: "2026-05-25T00:00:00.000Z",
        grantedScopes: ["scope-x", "scope-y"],
      },
    );

    expect(cipher.encrypted).toHaveLength(1);
    expect(cipher.encrypted[0]).toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: "2026-05-25T00:00:00.000Z",
      grantedScopes: "scope-x scope-y",
    });
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toMatchObject({
      instanceId: "inst-1",
      encryptedJson: "ciphertext-out",
      metadata: {
        providerId: "test.provider",
        scopes: ["scope-x", "scope-y"],
      },
    });
  });

  it("setMaterial throws IllegalMaterialSourceError for control-plane refs", async () => {
    const provider = makeProvider(new FakeStore(), new FakeCipher());
    await expect(
      provider.setMaterial({ source: "control-plane", id: "cp-1" }, { accessToken: "a", grantedScopes: [] }),
    ).rejects.toBeInstanceOf(IllegalMaterialSourceError);
  });
});

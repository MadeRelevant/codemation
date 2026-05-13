import { describe, it, expect } from "vitest";

import type { CredentialSessionFactoryArgs } from "@codemation/core";
import type {
  CredentialInstanceRecord,
  CredentialOAuth2MaterialRecord,
} from "../../src/domain/credentials/CredentialServices";
import type { CredentialStore } from "../../src/domain/credentials/CredentialServices";
import {
  OAuth2ViaBrokerCredentialTypeFactory,
  type OAuth2ViaBrokerPublicConfig,
} from "../../src/credentials/OAuth2ViaBrokerCredentialTypeFactory";
import { CredentialDisconnectedError } from "../../src/credentials/refresh/CredentialDisconnectedError";

// ── Stubs ──────────────────────────────────────────────────────────────────────

class StubCipher {
  decrypt(record: { encryptedJson: string }): Record<string, unknown> {
    return JSON.parse(record.encryptedJson) as Record<string, unknown>;
  }
}

function makeStore(material: CredentialOAuth2MaterialRecord | undefined): CredentialStore {
  return {
    listInstances: async () => [],
    getInstance: async () => undefined,
    saveInstance: async () => {},
    deleteInstance: async () => {},
    getSecretMaterial: async () => undefined,
    createOAuth2State: async () => {},
    consumeOAuth2State: async () => undefined,
    getOAuth2Material: async () => material,
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

function makeOAuth2Material(overrides: Partial<Record<string, unknown>> = {}): CredentialOAuth2MaterialRecord {
  const tokenData = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expiry: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
  return {
    instanceId: "inst-1",
    encryptedJson: JSON.stringify(tokenData),
    encryptionKeyId: "key",
    schemaVersion: 1,
    providerId: "google-mail",
    scopes: ["https://mail.google.com/"],
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

const minimalInstance: CredentialInstanceRecord<OAuth2ViaBrokerPublicConfig> = {
  instanceId: "inst-1",
  typeId: "host.oauth2-via-broker",
  displayName: "My Gmail",
  sourceKind: "db",
  publicConfig: { oauthAppKey: "google-mail" },
  secretRef: { kind: "db" },
  tags: [],
  setupStatus: "ready",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const baseArgs: CredentialSessionFactoryArgs<OAuth2ViaBrokerPublicConfig, Record<string, never>> = {
  instance: minimalInstance,
  material: {},
  publicConfig: { oauthAppKey: "google-mail" },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("OAuth2ViaBrokerCredentialTypeFactory", () => {
  describe("definition", () => {
    it("has typeId host.oauth2-via-broker", () => {
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(undefined), new StubCipher() as never);
      expect(factory.register().definition.typeId).toBe("host.oauth2-via-broker");
    });

    it("has no secret fields", () => {
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(undefined), new StubCipher() as never);
      expect(factory.register().definition.secretFields).toHaveLength(0);
    });

    it("has oauthAppKey public field", () => {
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(undefined), new StubCipher() as never);
      const publicFields = factory.register().definition.publicFields ?? [];
      expect(publicFields.some((f) => f.key === "oauthAppKey")).toBe(true);
    });
  });

  describe("createSession", () => {
    it("returns a session whose applyToRequest adds Authorization: Bearer header", async () => {
      const material = makeOAuth2Material();
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(material), new StubCipher() as never);
      const credentialType = factory.register();

      const session = await credentialType.createSession(baseArgs);
      const delta = session.applyToRequest({});

      expect(delta.headers).toEqual({ authorization: "Bearer test-access-token" });
    });

    it("throws CredentialDisconnectedError when no OAuth2 material is stored", async () => {
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(undefined), new StubCipher() as never);
      const credentialType = factory.register();

      await expect(credentialType.createSession(baseArgs)).rejects.toBeInstanceOf(CredentialDisconnectedError);
    });

    it("throws CredentialDisconnectedError when access_token is missing in decrypted material", async () => {
      const material = makeOAuth2Material({ access_token: "" });
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(material), new StubCipher() as never);
      const credentialType = factory.register();

      await expect(credentialType.createSession(baseArgs)).rejects.toBeInstanceOf(CredentialDisconnectedError);
    });
  });

  describe("test", () => {
    it("returns healthy when a valid non-expired access token exists", async () => {
      const material = makeOAuth2Material();
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(material), new StubCipher() as never);
      const credentialType = factory.register();

      const result = await credentialType.test(baseArgs);

      expect(result.status).toBe("healthy");
    });

    it("returns failing when no material is stored", async () => {
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(undefined), new StubCipher() as never);
      const credentialType = factory.register();

      const result = await credentialType.test(baseArgs);

      expect(result.status).toBe("failing");
    });

    it("returns failing when access_token is missing", async () => {
      const material = makeOAuth2Material({ access_token: "" });
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(material), new StubCipher() as never);
      const credentialType = factory.register();

      const result = await credentialType.test(baseArgs);

      expect(result.status).toBe("failing");
    });

    it("returns failing when the access token is expired", async () => {
      const material = makeOAuth2Material({ expiry: "2020-01-01T00:00:00.000Z" });
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(material), new StubCipher() as never);
      const credentialType = factory.register();

      const result = await credentialType.test(baseArgs);

      expect(result.status).toBe("failing");
    });

    it("returns healthy when no expiry is recorded (non-expiring token)", async () => {
      const material = makeOAuth2Material({ expiry: undefined });
      const factory = new OAuth2ViaBrokerCredentialTypeFactory(makeStore(material), new StubCipher() as never);
      const credentialType = factory.register();

      const result = await credentialType.test(baseArgs);

      expect(result.status).toBe("healthy");
    });
  });
});

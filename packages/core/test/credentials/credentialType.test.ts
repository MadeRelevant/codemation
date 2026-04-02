import { describe, expect, it } from "vitest";

import type { CredentialType } from "../../src/contracts/credentialTypes";
import { defineCredential } from "../../src";
import { z } from "zod";

describe("CredentialType", () => {
  it("checks createSession and test against typed public config and material", () => {
    type Pub = Readonly<{ region: string }>;
    type Mat = Readonly<{ token: string }>;
    type Sess = Readonly<{ auth: string }>;

    const registration: CredentialType<Pub, Mat, Sess> = {
      definition: {
        typeId: "test.typedRegistration",
        displayName: "Typed registration",
        publicFields: [{ key: "region", label: "Region", type: "string", required: true }],
        secretFields: [{ key: "token", label: "Token", type: "password", required: true }],
      },
      createSession: async (args) => ({
        auth: `${args.publicConfig.region}:${args.material.token}`,
      }),
      test: async () => ({
        status: "unknown",
        testedAt: new Date().toISOString(),
      }),
    };

    expect(registration.definition.typeId).toBe("test.typedRegistration");
  });

  it("creates typed credential helpers from zod schemas", async () => {
    const myCredential = defineCredential({
      key: "test.helperCredential",
      label: "Helper credential",
      public: z.object({
        baseUrl: z.string().url(),
      }),
      secret: z.object({
        apiKey: z.string().min(1),
      }),
      async createSession({ publicConfig, material }) {
        return {
          baseUrl: publicConfig.baseUrl,
          apiKey: material.apiKey,
        };
      },
      async test({ publicConfig, material }) {
        return {
          status: publicConfig.baseUrl.length > 0 && material.apiKey.length > 0 ? "healthy" : "failing",
          testedAt: new Date().toISOString(),
        };
      },
    });

    expect(myCredential.definition.publicFields).toEqual([
      {
        key: "baseUrl",
        label: "Base Url",
        order: 0,
        required: true,
        type: "string",
      },
    ]);

    await expect(
      myCredential.createSession({
        instance: {
          instanceId: "cred-1",
          typeId: "test.helperCredential",
          displayName: "Helper credential",
          sourceKind: "db",
          publicConfig: { baseUrl: "https://api.example.com" },
          secretRef: {},
          tags: [],
          setupStatus: "ready",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        publicConfig: { baseUrl: "https://api.example.com" },
        material: { apiKey: "secret" },
      }),
    ).resolves.toEqual({
      baseUrl: "https://api.example.com",
      apiKey: "secret",
    });
  });
});

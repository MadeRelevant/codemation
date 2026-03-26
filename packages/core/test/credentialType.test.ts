import { describe, expect, it } from "vitest";

import type { CredentialType } from "../src/contracts/credentialTypes";

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
});

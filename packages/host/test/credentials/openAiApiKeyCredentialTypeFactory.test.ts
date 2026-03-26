import { describe, expect, it, vi } from "vitest";

import type { CredentialSessionFactoryArgs } from "@codemation/core";

import type { CredentialInstanceRecord } from "../../src/domain/credentials/CredentialServices";
import type { OpenAiApiKeyCredentialHealthTester } from "../../src/infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
import type {
  OpenAiApiKeyMaterial,
  OpenAiApiKeyPublicConfig,
} from "../../src/infrastructure/credentials/OpenAiApiKeyCredentialShapes.types";
import { OpenAiApiKeyCredentialTypeFactory } from "../../src/infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";

describe("OpenAiApiKeyCredentialTypeFactory", () => {
  it("delegates test() to the injected health tester", async () => {
    const test = vi.fn(async () => ({
      status: "healthy" as const,
      message: "ok",
      testedAt: "2020-01-01T00:00:00.000Z",
    }));
    const healthTester = { test } as unknown as OpenAiApiKeyCredentialHealthTester;
    const factory = new OpenAiApiKeyCredentialTypeFactory(healthTester);
    const credentialType = factory.createCredentialType();

    const minimalInstance: CredentialInstanceRecord<OpenAiApiKeyPublicConfig> = {
      instanceId: "i1",
      typeId: "openai.apiKey",
      displayName: "t",
      sourceKind: "db",
      publicConfig: {},
      secretRef: { kind: "db" },
      tags: [],
      setupStatus: "ready",
      createdAt: "",
      updatedAt: "",
    };
    const args: CredentialSessionFactoryArgs<OpenAiApiKeyPublicConfig, OpenAiApiKeyMaterial> = {
      instance: minimalInstance,
      material: { apiKey: "k" },
      publicConfig: {},
    };
    await credentialType.test(args);

    expect(test).toHaveBeenCalledTimes(1);
    expect(test).toHaveBeenCalledWith(args);
  });

  it("exposes openai.apiKey definition", () => {
    const factory = new OpenAiApiKeyCredentialTypeFactory({
      test: vi.fn(),
    } as unknown as OpenAiApiKeyCredentialHealthTester);
    const credentialType = factory.createCredentialType();
    expect(credentialType.definition.typeId).toBe("openai.apiKey");
  });
});

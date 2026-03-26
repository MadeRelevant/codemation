import { describe, expect, it, vi } from "vitest";

import type { OpenAiApiKeyCredentialHealthTester } from "../../src/infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
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
    const registered = factory.createRegisteredCredentialType();

    const args = {
      instance: { id: "i1" } as never,
      material: { apiKey: "k" },
      publicConfig: {},
    };
    await registered.test(args);

    expect(test).toHaveBeenCalledTimes(1);
    expect(test).toHaveBeenCalledWith(args);
  });

  it("exposes openai.apiKey definition", () => {
    const factory = new OpenAiApiKeyCredentialTypeFactory({
      test: vi.fn(),
    } as unknown as OpenAiApiKeyCredentialHealthTester);
    const registered = factory.createRegisteredCredentialType();
    expect(registered.definition.typeId).toBe("openai.apiKey");
  });
});

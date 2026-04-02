import { describe, expect, it, vi } from "vitest";

import { openAiApiKeyCredentialType } from "../../src/credentials";
import { CodemationPluginDefinitionFactory } from "../../src/presentation/config/CodemationPluginDefinitionFactory";
import type { CodemationPluginContext } from "../../src/presentation/config/CodemationPlugin";

describe("CodemationPluginDefinitionFactory", () => {
  it("registers credential types before user register", async () => {
    const order: string[] = [];
    const plugin = CodemationPluginDefinitionFactory.createPlugin({
      credentialTypes: [openAiApiKeyCredentialType],
      register: async () => {
        order.push("register");
      },
    });
    const context = {
      registerCredentialType: vi.fn(() => {
        order.push("credential");
      }),
    } as unknown as CodemationPluginContext;
    await plugin.register(context);
    expect(order).toEqual(["credential", "register"]);
    expect(
      plugin.credentialTypes?.some((c) => c.definition.typeId === openAiApiKeyCredentialType.definition.typeId),
    ).toBe(true);
  });
});

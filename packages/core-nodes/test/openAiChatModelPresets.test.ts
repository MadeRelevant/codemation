import { describe, expect, it } from "vitest";

import { openAiChatModelPresets } from "../src/chatModels/OpenAiChatModelPresetsFactory";

describe("OpenAiChatModelPresets", () => {
  it("exposes demo models with expected ids and presentation defaults", () => {
    expect(openAiChatModelPresets.demoGpt4oMini.model).toBe("gpt-4o-mini");
    expect(openAiChatModelPresets.demoGpt41.model).toBe("gpt-4.1");
    expect(openAiChatModelPresets.demoGpt4oMini.presentation.icon).toBe("builtin:openai");
    expect(openAiChatModelPresets.demoGpt4oMini.presentation.label).toBe("OpenAI");
  });
});

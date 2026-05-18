import type { ChatModelConfig } from "@codemation/core";
import { OpenAIChatModelConfig } from "../chatModels/openAiChatModelConfig";
import { CodemationChatModelConfig } from "../chatModels/CodemationChatModelConfig";

export class WorkflowChatModelFactory {
  static create(model: string | ChatModelConfig): ChatModelConfig {
    if (typeof model !== "string") {
      return model;
    }
    const [provider, resolvedModel] = model.includes(":") ? model.split(":", 2) : ["openai", model];
    if (provider === "codemation-managed") {
      return new CodemationChatModelConfig("Codemation Managed", resolvedModel ?? "");
    }
    if (provider !== "openai") {
      throw new Error(`Unsupported workflow().agent() model provider "${provider}".`);
    }
    return new OpenAIChatModelConfig("OpenAI", resolvedModel);
  }
}

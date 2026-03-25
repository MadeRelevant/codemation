import { OpenAIChatModelConfig } from "./openAiChatModelConfig";

/**
 * Default OpenAI chat model configs for scaffolds and demos (icon + label match {@link OpenAIChatModelConfig} defaults).
 * Prefer importing {@link openAiChatModelPresets} from here or from the consumer template re-export
 * instead of repeating {@link OpenAIChatModelConfig} construction in app workflows.
 */
export class OpenAiChatModelPresets {
  readonly demoGpt4oMini = new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini");

  readonly demoGpt41 = new OpenAIChatModelConfig("OpenAI", "gpt-4.1");
}

export const openAiChatModelPresets = new OpenAiChatModelPresets();

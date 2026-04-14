import type { ChatModelConfig, ChatModelStructuredOutputOptions } from "@codemation/core";
import { injectable } from "@codemation/core";

import { OpenAIChatModelFactory } from "./OpenAIChatModelFactory";

@injectable()
export class OpenAIStructuredOutputMethodFactory {
  create(chatModelConfig: ChatModelConfig): ChatModelStructuredOutputOptions | undefined {
    if (chatModelConfig.type !== OpenAIChatModelFactory) {
      return undefined;
    }
    const model = this.readModelName(chatModelConfig);
    if (!model) {
      return { method: "functionCalling", strict: true };
    }
    return {
      method: this.supportsJsonSchema(model) ? "jsonSchema" : "functionCalling",
      strict: true,
    };
  }

  private readModelName(chatModelConfig: ChatModelConfig): string | undefined {
    const candidate = chatModelConfig as Readonly<{ model?: unknown }>;
    return typeof candidate.model === "string" ? candidate.model : undefined;
  }

  private supportsJsonSchema(model: string): boolean {
    return (
      model === "gpt-4o" ||
      model.startsWith("gpt-4o-") ||
      model === "gpt-4o-mini" ||
      model.startsWith("gpt-4o-mini-")
    );
  }
}

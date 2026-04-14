import type { ChatModelConfig, ChatModelStructuredOutputOptions } from "@codemation/core";
import { injectable } from "@codemation/core";

import { OpenAIChatModelFactory } from "./OpenAIChatModelFactory";

@injectable()
export class OpenAIStructuredOutputMethodFactory {
  private static readonly isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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
    if (model === "gpt-4o" || model === "gpt-4o-mini") {
      return true;
    }
    return (
      this.supportsSnapshotAtOrAfter(model, "gpt-4o-", "2024-08-06") ||
      this.supportsSnapshotAtOrAfter(model, "gpt-4o-mini-", "2024-07-18")
    );
  }

  private supportsSnapshotAtOrAfter(model: string, prefix: string, minimumSnapshotDate: string): boolean {
    if (!model.startsWith(prefix)) {
      return false;
    }
    const snapshotDate = model.slice(prefix.length);
    return OpenAIStructuredOutputMethodFactory.isoDatePattern.test(snapshotDate) && snapshotDate >= minimumSnapshotDate;
  }
}

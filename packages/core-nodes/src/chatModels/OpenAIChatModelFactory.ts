import type { ChatLanguageModel, ChatModelFactory, NodeExecutionContext } from "@codemation/core";
import { chatModel } from "@codemation/core";

import { createOpenAI } from "@ai-sdk/openai";

import type { OpenAiCredentialSession } from "./OpenAiCredentialSession";
import type { OpenAIChatModelConfig } from "./openAiChatModelConfig";

@chatModel({ packageName: "@codemation/core-nodes" })
export class OpenAIChatModelFactory implements ChatModelFactory<OpenAIChatModelConfig> {
  async create(
    args: Readonly<{ config: OpenAIChatModelConfig; ctx: NodeExecutionContext<any> }>,
  ): Promise<ChatLanguageModel> {
    const session = await args.ctx.getCredential<OpenAiCredentialSession>(args.config.credentialSlotKey);
    const provider = createOpenAI({
      apiKey: session.apiKey,
      baseURL: session.baseUrl,
    });
    const languageModel = provider.chat(args.config.model);
    return {
      languageModel,
      modelName: args.config.model,
      provider: "openai",
      defaultCallOptions: {
        maxOutputTokens: args.config.options?.maxTokens,
        temperature: args.config.options?.temperature,
      },
    };
  }
}

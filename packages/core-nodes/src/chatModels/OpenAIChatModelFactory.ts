import type { ChatModelFactory, LangChainChatModelLike, NodeExecutionContext } from "@codemation/core";
import { chatModel } from "@codemation/core";
import { ChatOpenAI } from "@langchain/openai";
import type { OpenAIChatModelConfig } from "./openAiChatModelConfig";

@chatModel({ packageName: "@codemation/core-nodes" })
export class OpenAIChatModelFactory implements ChatModelFactory<OpenAIChatModelConfig> {
  async create(
    args: Readonly<{ config: OpenAIChatModelConfig; ctx: NodeExecutionContext<any> }>,
  ): Promise<LangChainChatModelLike> {
    const apiKey = await args.ctx.getCredential<string>(args.config.credentialSlotKey);
    return new ChatOpenAI({
      apiKey,
      model: args.config.model,
      temperature: args.config.options?.temperature,
      maxTokens: args.config.options?.maxTokens,
      configuration: args.config.options?.baseUrl ? { baseURL: args.config.options.baseUrl } : undefined,
    });
  }
}

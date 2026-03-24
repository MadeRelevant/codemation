import type { ChatModelFactory, LangChainChatModelLike, NodeExecutionContext } from "@codemation/core";
import { chatModel } from "@codemation/core";
import { ChatOpenAI } from "@langchain/openai";
import type { OpenAiCredentialSession } from "./OpenAiCredentialSession";
import type { OpenAIChatModelConfig } from "./openAiChatModelConfig";

@chatModel({ packageName: "@codemation/core-nodes" })
export class OpenAIChatModelFactory implements ChatModelFactory<OpenAIChatModelConfig> {
  async create(
    args: Readonly<{ config: OpenAIChatModelConfig; ctx: NodeExecutionContext<any> }>,
  ): Promise<LangChainChatModelLike> {
    const session = await args.ctx.getCredential<OpenAiCredentialSession>(args.config.credentialSlotKey);
    return new ChatOpenAI({
      apiKey: session.apiKey,
      model: args.config.model,
      temperature: args.config.options?.temperature,
      maxTokens: args.config.options?.maxTokens,
      configuration: session.baseUrl ? { baseURL: session.baseUrl } : undefined,
    });
  }
}

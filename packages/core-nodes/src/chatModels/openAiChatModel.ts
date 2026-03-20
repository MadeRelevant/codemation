import type {
AgentCanvasPresentation,
ChatModelConfig,
ChatModelFactory,
CredentialRequirement,
LangChainChatModelLike,
NodeExecutionContext,
} from "@codemation/core";

import { chatModel } from "@codemation/core";

import { ChatOpenAI } from "@langchain/openai";

import type { CanvasIconName } from "../canvasIconName";

@chatModel({ packageName: "@codemation/core-nodes" })
export class OpenAIChatModelFactory implements ChatModelFactory<OpenAIChatModelConfig> {
  async create(args: Readonly<{ config: OpenAIChatModelConfig; ctx: NodeExecutionContext<any> }>): Promise<LangChainChatModelLike> {
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

export class OpenAIChatModelConfig implements ChatModelConfig {
  readonly type = OpenAIChatModelFactory;

  constructor(
    public readonly name: string,
    public readonly model: string,
    public readonly credentialSlotKey: string = "openai",
    public readonly presentation?: AgentCanvasPresentation<CanvasIconName>,
    public readonly options?: Readonly<{
      baseUrl?: string;
      temperature?: number;
      maxTokens?: number;
    }>,
  ) {}

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: this.credentialSlotKey,
        label: "OpenAI API key",
        acceptedTypes: ["openai.apiKey"],
      },
    ];
  }
}

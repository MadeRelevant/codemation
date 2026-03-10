import type { AgentCanvasPresentation, ChatModelConfig, ChatModelFactory, LangChainChatModelLike, NodeExecutionContext } from "@codemation/core";
import { resolveCredential, type CredentialInput } from "@codemation/core";
import { ChatOpenAI } from "@langchain/openai";
import type { CanvasIconName } from "../canvasIconName";

export class OpenAIChatModelConfig implements ChatModelConfig {
  readonly token = OpenAIChatModelFactory;

  constructor(
    public readonly name: string,
    public readonly model: string,
    public readonly apiKey: CredentialInput<string>,
    public readonly presentation?: AgentCanvasPresentation<CanvasIconName>,
    public readonly options?: Readonly<{
      baseUrl?: string;
      temperature?: number;
      maxTokens?: number;
    }>,
  ) {}
}

export class OpenAIChatModelFactory implements ChatModelFactory<OpenAIChatModelConfig> {
  async create(args: Readonly<{ config: OpenAIChatModelConfig; ctx: NodeExecutionContext<any> }>): Promise<LangChainChatModelLike> {
    const apiKey = await resolveCredential(args.config.apiKey, args.ctx.services.credentials);
    return new ChatOpenAI({
      apiKey,
      model: args.config.model,
      temperature: args.config.options?.temperature,
      maxTokens: args.config.options?.maxTokens,
      configuration: args.config.options?.baseUrl ? { baseURL: args.config.options.baseUrl } : undefined,
    });
  }
}

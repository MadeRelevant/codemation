import type { AgentCanvasPresentation, ChatModelConfig, ChatModelFactory, CredentialService, LangChainChatModelLike, NodeExecutionContext } from "@codemation/core";
import { CoreTokens, chatModel, inject, resolveCredential, type CredentialInput } from "@codemation/core";
import { ChatOpenAI } from "@langchain/openai";
import type { CanvasIconName } from "../canvasIconName";

export class OpenAIChatModelConfig implements ChatModelConfig {
  readonly type = OpenAIChatModelFactory;

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

@chatModel({ packageName: "@codemation/core-nodes" })
export class OpenAIChatModelFactory implements ChatModelFactory<OpenAIChatModelConfig> {
  constructor(
    @inject(CoreTokens.CredentialService)
    private readonly credentials: CredentialService,
  ) {}

  async create(args: Readonly<{ config: OpenAIChatModelConfig; ctx: NodeExecutionContext<any> }>): Promise<LangChainChatModelLike> {
    const apiKey = await resolveCredential(args.config.apiKey, this.credentials);
    return new ChatOpenAI({
      apiKey,
      model: args.config.model,
      temperature: args.config.options?.temperature,
      maxTokens: args.config.options?.maxTokens,
      configuration: args.config.options?.baseUrl ? { baseURL: args.config.options.baseUrl } : undefined,
    });
  }
}

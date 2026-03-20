import type {
AgentNodeConfig,
ChatModelConfig,
Item,
Items,
NodeExecutionContext,
RunnableNodeConfig,
ToolConfig,
TypeToken,
} from "@codemation/core";

import { AIAgentNode } from "./AIAgentNode";

export class AIAgent<TInputJson = unknown, TOutputJson = unknown>
  implements RunnableNodeConfig<TInputJson, TOutputJson>, AgentNodeConfig<TInputJson, TOutputJson>
{
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = AIAgentNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string,
    public readonly systemMessage: string,
    public readonly userMessageFormatter: (
      item: Item<TInputJson>,
      index: number,
      items: Items<TInputJson>,
      ctx: NodeExecutionContext<AIAgent<TInputJson, TOutputJson>>,
    ) => string,
    public readonly chatModel: ChatModelConfig,
    public readonly tools: ReadonlyArray<ToolConfig> = [],
    public readonly id?: string,
  ) {}

  getCredentialRequirements() {
    return this.chatModel.getCredentialRequirements?.() ?? [];
  }
}

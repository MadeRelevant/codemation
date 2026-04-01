import {
  RetryPolicy,
  type AgentGuardrailConfig,
  type AgentMessageConfig,
  type AgentNodeConfig,
  type ChatModelConfig,
  type RetryPolicySpec,
  type RunnableNodeConfig,
  type ToolConfig,
  type TypeToken,
} from "@codemation/core";

import { AIAgentNode } from "./AIAgentNode";

export interface AIAgentOptions<TInputJson = unknown, _TOutputJson = unknown> {
  readonly name: string;
  readonly messages: AgentMessageConfig<TInputJson>;
  readonly chatModel: ChatModelConfig;
  readonly tools?: ReadonlyArray<ToolConfig>;
  readonly id?: string;
  readonly retryPolicy?: RetryPolicySpec;
  readonly guardrails?: AgentGuardrailConfig;
}

/**
 * AI agent: credential bindings are keyed to connection-owned LLM/tool node ids (ConnectionNodeIdFactory),
 * not to the agent workflow node id.
 */
export class AIAgent<TInputJson = unknown, TOutputJson = unknown>
  implements RunnableNodeConfig<TInputJson, TOutputJson>, AgentNodeConfig<TInputJson, TOutputJson>
{
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = AIAgentNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:bot" as const;
  readonly name: string;
  readonly messages: AgentMessageConfig<TInputJson>;
  readonly chatModel: ChatModelConfig;
  readonly tools: ReadonlyArray<ToolConfig>;
  readonly id?: string;
  readonly retryPolicy: RetryPolicySpec;
  readonly guardrails?: AgentGuardrailConfig;

  constructor(options: AIAgentOptions<TInputJson, TOutputJson>) {
    this.name = options.name;
    this.messages = options.messages;
    this.chatModel = options.chatModel;
    this.tools = options.tools ?? [];
    this.id = options.id;
    this.retryPolicy = options.retryPolicy ?? RetryPolicy.defaultForAiAgent;
    this.guardrails = options.guardrails;
  }
}

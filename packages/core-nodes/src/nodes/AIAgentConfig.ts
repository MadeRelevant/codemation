import {
  RetryPolicy,
  type AgentGuardrailConfig,
  type AgentMessageConfig,
  type AgentNodeConfig,
  type ChatModelConfig,
  type ItemInputMapper,
  type RetryPolicySpec,
  type RunnableNodeConfig,
  type ToolConfig,
  type TypeToken,
} from "@codemation/core";
import type { ZodType } from "zod";

import { AIAgentNode } from "./AIAgentNode";

export interface AIAgentOptions<TInputJson = unknown, _TOutputJson = unknown, TWireJson = TInputJson> {
  readonly name: string;
  readonly messages: AgentMessageConfig<TInputJson>;
  readonly chatModel: ChatModelConfig;
  readonly tools?: ReadonlyArray<ToolConfig>;
  readonly id?: string;
  readonly retryPolicy?: RetryPolicySpec;
  readonly guardrails?: AgentGuardrailConfig;
  /** Engine applies with {@link RunnableNodeConfig.inputSchema} before {@link AIAgentNode.executeOne}. */
  readonly inputSchema?: ZodType<TInputJson>;
  /** Per-item mapper before validation; use with {@link inputSchema} so persisted run inputs show the prompt payload. */
  readonly mapInput?: ItemInputMapper<TWireJson, TInputJson>;
}

/**
 * AI agent: credential bindings are keyed to connection-owned LLM/tool node ids (ConnectionNodeIdFactory),
 * not to the agent workflow node id.
 */
export class AIAgent<TInputJson = unknown, TOutputJson = unknown, TWireJson = TInputJson>
  implements RunnableNodeConfig<TInputJson, TOutputJson, TWireJson>, AgentNodeConfig<TInputJson, TOutputJson, TWireJson>
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
  readonly inputSchema?: ZodType<TInputJson>;
  readonly mapInput?: ItemInputMapper<TWireJson, TInputJson>;

  constructor(options: AIAgentOptions<TInputJson, TOutputJson, TWireJson>) {
    this.name = options.name;
    this.messages = options.messages;
    this.chatModel = options.chatModel;
    this.tools = options.tools ?? [];
    this.id = options.id;
    this.retryPolicy = options.retryPolicy ?? RetryPolicy.defaultForAiAgent;
    this.guardrails = options.guardrails;
    this.inputSchema = options.inputSchema;
    this.mapInput = options.mapInput;
  }
}

import {
  RetryPolicy,
  type AgentGuardrailConfig,
  type AgentMessageConfig,
  type AgentNodeConfig,
  type ChatModelConfig,
  type NodeInspectorSummaryRow,
  type RetryPolicySpec,
  type RunnableNodeConfig,
  type ToolConfig,
  type TypeToken,
} from "@codemation/core";
import type { ZodType } from "zod";

import { AIAgentNode } from "./AIAgentNode";

export interface AIAgentOptions<TInputJson = unknown, _TOutputJson = unknown> {
  readonly name: string;
  readonly messages: AgentMessageConfig<TInputJson>;
  readonly chatModel: ChatModelConfig;
  readonly tools?: ReadonlyArray<ToolConfig>;
  readonly id?: string;
  readonly retryPolicy?: RetryPolicySpec;
  readonly guardrails?: AgentGuardrailConfig;
  /** Engine applies with {@link RunnableNodeConfig.inputSchema} before {@link AIAgentNode.execute}. */
  readonly inputSchema?: ZodType<TInputJson>;
  readonly outputSchema?: ZodType<_TOutputJson>;
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
  readonly inputSchema?: ZodType<TInputJson>;
  readonly outputSchema?: ZodType<TOutputJson>;

  constructor(options: AIAgentOptions<TInputJson, TOutputJson>) {
    this.name = options.name;
    this.messages = options.messages;
    this.chatModel = options.chatModel;
    this.tools = options.tools ?? [];
    this.id = options.id;
    this.retryPolicy = options.retryPolicy ?? RetryPolicy.defaultForAiAgent;
    this.guardrails = options.guardrails;
    this.inputSchema = options.inputSchema;
    this.outputSchema = options.outputSchema;
  }

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> {
    const rows: NodeInspectorSummaryRow[] = [];

    if (this.chatModel.modelName) {
      rows.push({ label: "Model", value: this.chatModel.modelName });
    } else if (this.chatModel.name) {
      rows.push({ label: "Model", value: this.chatModel.name });
    }

    const messages = Array.isArray(this.messages)
      ? this.messages
      : typeof this.messages === "object" && this.messages !== null && "prompt" in (this.messages as object)
        ? (this.messages as { prompt?: unknown }).prompt
        : undefined;
    if (Array.isArray(messages)) {
      const systemMsg = messages.find(
        (m: unknown) => m !== null && typeof m === "object" && (m as { role?: string }).role === "system",
      ) as { content?: unknown } | undefined;
      if (systemMsg?.content !== undefined) {
        const content = typeof systemMsg.content === "function" ? "(dynamic)" : String(systemMsg.content);
        const truncated = content.length > 80 ? `${content.slice(0, 79)}…` : content;
        rows.push({ label: "System prompt", value: truncated });
      }
    }

    if (this.tools.length > 0) {
      rows.push({ label: "Tools", value: String(this.tools.length) });
    }

    if (this.guardrails?.maxTurns !== undefined) {
      rows.push({ label: "Max turns", value: String(this.guardrails.maxTurns) });
    }

    return rows;
  }
}

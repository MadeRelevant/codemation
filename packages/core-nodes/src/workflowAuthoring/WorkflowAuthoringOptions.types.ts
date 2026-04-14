import type {
  AgentGuardrailConfig,
  AgentMessageConfig,
  ChatModelConfig,
  RunnableNodeConfig,
  ToolConfig,
} from "@codemation/core";
import { z } from "zod";

export type WorkflowAgentMessages<TCurrentJson> = AgentMessageConfig<TCurrentJson>;

export interface WorkflowAgentOptions<TCurrentJson, TOutputSchema extends z.ZodTypeAny | undefined = undefined> {
  readonly messages: WorkflowAgentMessages<TCurrentJson>;
  readonly model: string | ChatModelConfig;
  readonly tools?: ReadonlyArray<ToolConfig>;
  readonly outputSchema?: TOutputSchema;
  readonly retryPolicy?: RunnableNodeConfig["retryPolicy"];
  readonly guardrails?: AgentGuardrailConfig;
  readonly id?: string;
}

import type { AgentGuardrailConfig, ChatModelConfig, RunnableNodeConfig, ToolConfig } from "@codemation/core";
import { z } from "zod";

export type WorkflowAgentPrompt<TCurrentJson> = string | ((item: TCurrentJson) => string);

export interface WorkflowAgentOptions<TCurrentJson, TOutputSchema extends z.ZodTypeAny | undefined = undefined> {
  readonly prompt: WorkflowAgentPrompt<TCurrentJson>;
  readonly model: string | ChatModelConfig;
  readonly tools?: ReadonlyArray<ToolConfig>;
  readonly outputSchema?: TOutputSchema;
  readonly retryPolicy?: RunnableNodeConfig["retryPolicy"];
  readonly guardrails?: AgentGuardrailConfig;
  readonly id?: string;
}

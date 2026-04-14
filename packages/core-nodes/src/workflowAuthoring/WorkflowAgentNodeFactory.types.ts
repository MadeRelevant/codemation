import { z } from "zod";
import { AIAgent } from "../nodes/AIAgentConfig";
import type { WorkflowAgentOptions } from "./WorkflowAuthoringOptions.types";
import { WorkflowChatModelFactory } from "./WorkflowChatModelFactory.types";

export class WorkflowAgentNodeFactory {
  static create<TCurrentJson, TOutputSchema extends z.ZodTypeAny | undefined>(
    nameOrOptions: string | WorkflowAgentOptions<TCurrentJson, TOutputSchema>,
    optionsOrUndefined?: WorkflowAgentOptions<TCurrentJson, TOutputSchema>,
  ): AIAgent<TCurrentJson, TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>> {
    const options = typeof nameOrOptions === "string" ? optionsOrUndefined! : nameOrOptions;
    const name = typeof nameOrOptions === "string" ? nameOrOptions : "AI agent";
    return new AIAgent<
      TCurrentJson,
      TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>
    >({
      name,
      messages: options.messages,
      chatModel: WorkflowChatModelFactory.create(options.model),
      tools: options.tools,
      id: options.id,
      retryPolicy: options.retryPolicy,
      guardrails: options.guardrails,
    });
  }
}

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
    const prompt = options.prompt;
    const messages = [
      {
        role: "user" as const,
        content:
          typeof prompt === "function" ? ({ item }: { item: { json: TCurrentJson } }) => prompt(item.json) : prompt,
      },
    ] as const;
    const outputSchema =
      options.outputSchema as
        | z.ZodType<TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>>
        | undefined;
    return new AIAgent<
      TCurrentJson,
      TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>
    >({
      name,
      messages,
      chatModel: WorkflowChatModelFactory.create(options.model),
      tools: options.tools,
      outputSchema,
      id: options.id,
      retryPolicy: options.retryPolicy,
      guardrails: options.guardrails,
    });
  }
}

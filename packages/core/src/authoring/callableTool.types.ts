import type { ZodSchemaAny } from "../ai/AiHost";
import type { CallableToolConfig, CallableToolConfigOptions } from "../ai/CallableToolConfig";
import { CallableToolFactory } from "../ai/CallableToolFactory";

/**
 * Workflow-facing helper for inline Zod-typed agent tools (same as {@link CallableToolFactory.callableTool}).
 */
export function callableTool<TInputSchema extends ZodSchemaAny, TOutputSchema extends ZodSchemaAny>(
  options: CallableToolConfigOptions<TInputSchema, TOutputSchema>,
): CallableToolConfig<TInputSchema, TOutputSchema> {
  return CallableToolFactory.callableTool(options);
}

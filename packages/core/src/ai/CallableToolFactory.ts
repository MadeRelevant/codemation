import type { ZodSchemaAny } from "./AiHost";
import { CallableToolConfig } from "./CallableToolConfig";
import type { CallableToolConfigOptions } from "./CallableToolConfig";

class CallableToolFactoryImpl {
  callableTool<TInputSchema extends ZodSchemaAny, TOutputSchema extends ZodSchemaAny>(
    options: CallableToolConfigOptions<TInputSchema, TOutputSchema>,
  ): CallableToolConfig<TInputSchema, TOutputSchema> {
    return new CallableToolConfig(options.name, options);
  }
}

export const CallableToolFactory = new CallableToolFactoryImpl();

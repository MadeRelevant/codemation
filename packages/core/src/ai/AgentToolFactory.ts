import type { RunnableNodeConfig } from "../types";
import type { NodeBackedToolConfigOptions, ZodSchemaAny } from "./AiHost";
import { NodeBackedToolConfig } from "./NodeBackedToolConfig";

class AgentToolFactoryImpl {
  asTool<
    TNodeConfig extends RunnableNodeConfig<any, any>,
    TInputSchema extends ZodSchemaAny,
    TOutputSchema extends ZodSchemaAny,
  >(
    node: TNodeConfig,
    options: Readonly<{ name?: string } & NodeBackedToolConfigOptions<TNodeConfig, TInputSchema, TOutputSchema>>,
  ): NodeBackedToolConfig<TNodeConfig, TInputSchema, TOutputSchema> {
    return new NodeBackedToolConfig(options.name ?? node.name ?? "tool", node, options);
  }
}

export const AgentToolFactory = new AgentToolFactoryImpl();

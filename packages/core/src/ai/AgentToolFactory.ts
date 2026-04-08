import type { Item, RunnableNodeConfig } from "../types";
import type { NodeBackedToolConfigOptions, ZodSchemaAny } from "./AiHost";
import { AgentConfigInspector } from "./AgentConfigInspectorFactory";
import { NodeBackedToolConfig } from "./NodeBackedToolConfig";

class AgentToolFactoryImpl {
  asTool<
    TNodeConfig extends RunnableNodeConfig<any, any, any>,
    TInputSchema extends ZodSchemaAny,
    TOutputSchema extends ZodSchemaAny,
  >(
    node: TNodeConfig,
    options: Readonly<{ name?: string } & NodeBackedToolConfigOptions<TNodeConfig, TInputSchema, TOutputSchema>>,
  ): NodeBackedToolConfig<TNodeConfig, TInputSchema, TOutputSchema> {
    return new NodeBackedToolConfig(
      options.name ?? node.name ?? "tool",
      node,
      this.withDefaultAgentInputMapper(node, options),
    );
  }

  private withDefaultAgentInputMapper<
    TNodeConfig extends RunnableNodeConfig<any, any, any>,
    TInputSchema extends ZodSchemaAny,
    TOutputSchema extends ZodSchemaAny,
  >(
    node: TNodeConfig,
    options: Readonly<{ name?: string } & NodeBackedToolConfigOptions<TNodeConfig, TInputSchema, TOutputSchema>>,
  ): Readonly<{ name?: string } & NodeBackedToolConfigOptions<TNodeConfig, TInputSchema, TOutputSchema>> {
    if (options.mapInput || !AgentConfigInspector.isAgentNodeConfig(node)) {
      return options;
    }
    return {
      ...options,
      mapInput: ({ input, item }) => this.mergeAgentToolInputWithCurrentItem(input, item) as never,
    };
  }

  private mergeAgentToolInputWithCurrentItem(input: unknown, item: Item): unknown {
    if (!this.isMergeableRecord(input) || !this.isMergeableRecord(item.json)) {
      return input;
    }
    return {
      ...item.json,
      ...input,
    };
  }

  private isMergeableRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

export const AgentToolFactory = new AgentToolFactoryImpl();

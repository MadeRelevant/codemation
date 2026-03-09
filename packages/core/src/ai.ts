import type { TypeToken } from "./di";
import type { Item, Items, NodeExecutionContext } from "./types";
import type { CredentialInput } from "./credentials";
import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";

export type OpenAIChatModelId = string;
export type OpenAIChatModelOptions = Readonly<{
  /**
   * OpenAI API key (recommended as a credential reference).
   */
  apiKey?: CredentialInput<string>;
  /**
   * Additional provider-specific options (kept opaque in core).
   */
  options?: Readonly<Record<string, unknown>>;
}>;

export interface ChatModelConfig {
  provider: "openai";
  model: OpenAIChatModelId;
  options?: OpenAIChatModelOptions;
}

export class ChatModelConfigFactory {
  static openai(model: OpenAIChatModelId, options?: OpenAIChatModelOptions): ChatModelConfig {
    return { provider: "openai", model, options };
  }
}

export type AgentToolExecuteArgs<TInput = unknown> = Readonly<{
  input: TInput;
  /**
   * Node execution context from the node that is invoking this tool.
   */
  ctx: NodeExecutionContext<any>;
  /**
   * Current item this tool is invoked for (easy access).
   */
  item: Item;
  itemIndex: number;
  items: Items;
  /**
   * Tool token for provenance/debugging.
   */
  token: TypeToken<any>;
}>;

export type ZodSchemaAny = ZodType<any, any, any>;

export interface AgentTool<TInputSchema extends ZodSchemaAny = ZodSchemaAny, TOutputSchema extends ZodSchemaAny = ZodSchemaAny> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  execute(args: AgentToolExecuteArgs<ZodInput<TInputSchema>>): Promise<ZodOutput<TOutputSchema>> | ZodOutput<TOutputSchema>;
}

export type AgentToolToken = TypeToken<AgentTool<any, any>>;

export type AgentToolCall = Readonly<{ name: string; input: unknown }>;
export type AgentToolCallPlanner<_TNodeConfig = unknown> = (
  item: Item,
  index: number,
  items: Items,
  ctx: NodeExecutionContext<any>,
) => ReadonlyArray<AgentToolCall>;


import type {
  AgentToolCall,
  Item,
  NodeInputsByPort,
  ToolConfig,
  ToolExecuteArgs,
  ZodSchemaAny,
} from "@codemation/core";

export class AgentItemPortMap {
  static fromItem(item: Item): NodeInputsByPort {
    return { in: [item] };
  }
}

export type ResolvedTool = Readonly<{
  config: ToolConfig;
  runtime: Readonly<{
    defaultDescription: string;
    inputSchema: ZodSchemaAny;
    execute(args: ToolExecuteArgs<ToolConfig, unknown>): Promise<unknown>;
  }>;
}>;

/**
 * Per-item binding of a tool: the user config plus the resolved runtime and a snapshot of the
 * original Zod `inputSchema` used to convert to AI SDK `Tool` + OpenAI-strict JSON Schema for
 * repair prompts.
 */
export type ItemScopedToolBinding = Readonly<{
  config: ToolConfig;
  inputSchema: ZodSchemaAny;
  execute(input: unknown): Promise<unknown>;
}>;

export type PlannedToolCall = Readonly<{
  binding: ItemScopedToolBinding;
  toolCall: AgentToolCall;
  invocationIndex: number;
  nodeId: string;
}>;

export type ExecutedToolCall = Readonly<{
  toolName: string;
  toolCallId: string;
  result: unknown;
  serialized: string;
}>;

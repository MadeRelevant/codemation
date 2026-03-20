import type { AgentToolCall,Item,NodeInputsByPort,Tool,ToolConfig,ZodSchemaAny } from "@codemation/core";
import type { DynamicStructuredTool } from "@langchain/core/tools";

export class AgentItemPortMap {
  static fromItem(item: Item): NodeInputsByPort {
    return { in: [item] };
  }
}

export type ResolvedTool = Readonly<{
  config: ToolConfig;
  tool: Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>;
}>;

export type ItemScopedToolBinding = Readonly<{
  config: ToolConfig;
  langChainTool: DynamicStructuredTool;
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

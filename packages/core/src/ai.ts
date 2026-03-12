import type { TypeToken } from "./di";
import type { Item, Items, NodeConfigBase, NodeExecutionContext, NodeId, RunnableNodeConfig } from "./types";
import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";

export interface AgentCanvasPresentation<TIcon extends string = string> {
  readonly label?: string;
  readonly icon?: TIcon;
}

export type ZodSchemaAny = ZodType<any, any, any>;

export interface ToolConfig {
  readonly type: TypeToken<Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>>;
  readonly name: string;
  readonly description?: string;
  readonly presentation?: AgentCanvasPresentation;
}

export type ToolExecuteArgs<TConfig extends ToolConfig = ToolConfig, TInput = unknown> = Readonly<{
  config: TConfig;
  input: TInput;
  ctx: NodeExecutionContext<any>;
  item: Item;
  itemIndex: number;
  items: Items;
}>;

export interface Tool<TConfig extends ToolConfig = ToolConfig, TInputSchema extends ZodSchemaAny = ZodSchemaAny, TOutputSchema extends ZodSchemaAny = ZodSchemaAny> {
  readonly defaultDescription: string;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  execute(args: ToolExecuteArgs<TConfig, ZodInput<TInputSchema>>): Promise<ZodOutput<TOutputSchema>> | ZodOutput<TOutputSchema>;
}

export type AgentTool<TInputSchema extends ZodSchemaAny = ZodSchemaAny, TOutputSchema extends ZodSchemaAny = ZodSchemaAny> = Tool<
  ToolConfig,
  TInputSchema,
  TOutputSchema
>;

export type AgentToolExecuteArgs<TInput = unknown> = ToolExecuteArgs<ToolConfig, TInput>;
export type AgentToolToken = TypeToken<Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>>;

export interface AgentToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodSchemaAny;
}

export type AgentToolCall = Readonly<{ id?: string; name: string; input: unknown }>;
export type AgentToolCallPlanner<_TNodeConfig = unknown> = (
  item: Item,
  index: number,
  items: Items,
  ctx: NodeExecutionContext<any>,
) => ReadonlyArray<AgentToolCall>;

export interface ChatModelConfig {
  readonly type: TypeToken<ChatModelFactory<ChatModelConfig>>;
  readonly name: string;
  readonly presentation?: AgentCanvasPresentation;
}

export interface LangChainChatModelLike {
  invoke(input: unknown, options?: unknown): Promise<unknown>;
  bindTools?(tools: ReadonlyArray<unknown>): LangChainChatModelLike;
}

export interface ChatModelFactory<TConfig extends ChatModelConfig = ChatModelConfig> {
  create(args: Readonly<{ config: TConfig; ctx: NodeExecutionContext<any> }>): Promise<LangChainChatModelLike> | LangChainChatModelLike;
}

export interface AgentNodeConfig<TInputJson = unknown, TOutputJson = unknown> extends RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly systemMessage: string;
  readonly userMessageFormatter: (
    item: Item<TInputJson>,
    index: number,
    items: Items<TInputJson>,
    ctx: NodeExecutionContext<any>,
  ) => string;
  readonly chatModel: ChatModelConfig;
  readonly tools?: ReadonlyArray<ToolConfig>;
}

export class AgentConfigInspector {
  static isAgentNodeConfig(config: NodeConfigBase | undefined): config is AgentNodeConfig<any, any> {
    if (!config) return false;
    const candidate = config as Partial<AgentNodeConfig<any, any>>;
    return typeof candidate.systemMessage === "string" && typeof candidate.userMessageFormatter === "function" && !!candidate.chatModel;
  }
}

export type AgentAttachmentRole = "languageModel" | "tool";

export class AgentAttachmentNodeIdFactory {
  static createLanguageModelNodeId(parentNodeId: NodeId, invocationIndex?: number): NodeId {
    return invocationIndex === undefined ? `${parentNodeId}::llm` : `${parentNodeId}::llm::${this.normalizeInvocationIndex(invocationIndex)}`;
  }

  static parseLanguageModelNodeId(nodeId: NodeId): Readonly<{ parentNodeId: NodeId; invocationIndex: number }> | null {
    const parts = nodeId.split("::");
    if (parts.length < 3 || parts.at(-2) !== "llm") return null;
    const invocationIndex = this.parseInvocationIndex(parts.at(-1));
    if (invocationIndex === null) return null;
    const parentNodeId = parts.slice(0, -2).join("::");
    return parentNodeId ? { parentNodeId, invocationIndex } : null;
  }

  static getBaseLanguageModelNodeId(nodeId: NodeId): NodeId {
    const parsed = this.parseLanguageModelNodeId(nodeId);
    return parsed ? this.createLanguageModelNodeId(parsed.parentNodeId) : nodeId;
  }

  static createToolNodeId(parentNodeId: NodeId, toolName: string, invocationIndex?: number): NodeId {
    const normalizedToolName = this.normalizeToolName(toolName);
    return invocationIndex === undefined
      ? `${parentNodeId}::tool::${normalizedToolName}`
      : `${parentNodeId}::tool::${normalizedToolName}::${this.normalizeInvocationIndex(invocationIndex)}`;
  }

  static parseToolNodeId(nodeId: NodeId): Readonly<{ parentNodeId: NodeId; toolName: string; invocationIndex: number }> | null {
    const parts = nodeId.split("::");
    if (parts.length < 4 || parts.at(-3) !== "tool") return null;
    const toolName = parts.at(-2);
    const invocationIndex = this.parseInvocationIndex(parts.at(-1));
    if (!toolName || invocationIndex === null) return null;
    const parentNodeId = parts.slice(0, -3).join("::");
    return parentNodeId ? { parentNodeId, toolName, invocationIndex } : null;
  }

  static getBaseToolNodeId(nodeId: NodeId): NodeId {
    const parsed = this.parseToolNodeId(nodeId);
    return parsed ? this.createToolNodeId(parsed.parentNodeId, parsed.toolName) : nodeId;
  }

  private static normalizeToolName(toolName: string): string {
    return toolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "tool";
  }

  private static normalizeInvocationIndex(invocationIndex: number): number {
    if (!Number.isInteger(invocationIndex) || invocationIndex < 1) {
      throw new Error(`Agent attachment invocation index must be a positive integer. Received: ${invocationIndex}`);
    }
    return invocationIndex;
  }

  private static parseInvocationIndex(value: string | undefined): number | null {
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    return Number.parseInt(value, 10);
  }
}


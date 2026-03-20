import type { TypeToken } from "./di";


import type { CredentialRequirement } from "./contracts/credentialTypes";


import type { Item, Items, NodeConfigBase, NodeExecutionContext, RunnableNodeConfig } from "./types";


import type { input as ZodInput,output as ZodOutput,ZodType } from "zod";



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
  getCredentialRequirements?(): ReadonlyArray<CredentialRequirement>;
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

export { AgentAttachmentNodeIdFactory } from "./AgentAttachmentNodeIdFactory";

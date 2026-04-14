import type { TypeToken } from "../di";

import type { CredentialRequirement } from "../contracts/credentialTypes";
import type { ItemValue } from "../contracts/itemValue";

import type {
  Item,
  Items,
  JsonValue,
  NodeExecutionContext,
  NodeOutputs,
  RunnableNodeConfig,
  RunnableNodeInputJson,
} from "../types";

import type { input as ZodInput, output as ZodOutput, ZodType } from "zod";

export interface AgentCanvasPresentation<TIcon extends string = string> {
  readonly label?: string;
  readonly icon?: TIcon;
}

export type ZodSchemaAny = ZodType<any, any, any>;

export interface ToolConfig {
  readonly type: TypeToken<unknown>;
  readonly name: string;
  readonly description?: string;
  readonly presentation?: AgentCanvasPresentation;
  getCredentialRequirements?(): ReadonlyArray<CredentialRequirement>;
}

export type ToolExecuteArgs<TConfig extends ToolConfig = ToolConfig, TInput = unknown> = Readonly<{
  config: TConfig;
  input: TInput;
  ctx: NodeExecutionContext<any>;
  item: Item;
  itemIndex: number;
  items: Items;
}>;

export interface Tool<
  TConfig extends ToolConfig = ToolConfig,
  TInputSchema extends ZodSchemaAny = ZodSchemaAny,
  TOutputSchema extends ZodSchemaAny = ZodSchemaAny,
> {
  readonly defaultDescription: string;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  execute(
    args: ToolExecuteArgs<TConfig, ZodInput<TInputSchema>>,
  ): Promise<ZodOutput<TOutputSchema>> | ZodOutput<TOutputSchema>;
}

export type AgentTool<
  TInputSchema extends ZodSchemaAny = ZodSchemaAny,
  TOutputSchema extends ZodSchemaAny = ZodSchemaAny,
> = Tool<ToolConfig, TInputSchema, TOutputSchema>;

export type AgentToolExecuteArgs<TInput = unknown> = ToolExecuteArgs<ToolConfig, TInput>;

export type AgentToolToken = TypeToken<Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>>;

export type AgentMessageRole = "system" | "user" | "assistant";

export type AgentMessageBuildArgs<TInputJson = unknown> = Readonly<{
  item: Item<TInputJson>;
  itemIndex: number;
  items: Items<TInputJson>;
  ctx: NodeExecutionContext<any>;
}>;

export interface AgentMessageDto {
  readonly role: AgentMessageRole;
  readonly content: string;
}

export type AgentMessageTemplateContent<TInputJson = unknown> =
  | string
  | ((args: AgentMessageBuildArgs<TInputJson>) => string);

export interface AgentMessageTemplate<TInputJson = unknown> {
  readonly role: AgentMessageRole;
  readonly content: AgentMessageTemplateContent<TInputJson>;
}

/** A single prompt line: fixed DTO or template with optional function `content`. */
export type AgentMessageLine<TInputJson = unknown> = AgentMessageDto | AgentMessageTemplate<TInputJson>;

/**
 * Message list for an agent. Prefer a **plain array** of `{ role, content }` (optionally with function `content` for templates).
 * Use the object form only when you need `buildMessages` to append messages after optional `prompt` lines.
 */
export type AgentMessageConfig<TInputJson = unknown> =
  | ItemValue<ReadonlyArray<AgentMessageLine<TInputJson>>, TInputJson>
  | ReadonlyArray<AgentMessageLine<TInputJson>>
  | {
      readonly prompt?: ReadonlyArray<AgentMessageLine<TInputJson>>;
      readonly buildMessages?: (args: AgentMessageBuildArgs<TInputJson>) => ReadonlyArray<AgentMessageDto>;
    };

export type AgentTurnLimitBehavior = "error" | "respondWithLastMessage";

export interface AgentModelInvocationOptions {
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, JsonValue>>;
}

export interface AgentGuardrailConfig {
  readonly maxTurns?: number;
  readonly onTurnLimitReached?: AgentTurnLimitBehavior;
  readonly modelInvocationOptions?: AgentModelInvocationOptions;
}

/** Defaults aligned with common tool-agent iteration limits (many products use ~10 max rounds). */
export const AgentGuardrailDefaults = {
  maxTurns: 10,
  onTurnLimitReached: "error" as AgentTurnLimitBehavior,
} as const;

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
  create(
    args: Readonly<{ config: TConfig; ctx: NodeExecutionContext<any> }>,
  ): Promise<LangChainChatModelLike> | LangChainChatModelLike;
}

export type NodeBackedToolInputMapperArgs<
  TNodeConfig extends RunnableNodeConfig<any, any>,
  TToolInput = unknown,
> = Readonly<{
  input: TToolInput;
  item: Item;
  itemIndex: number;
  items: Items;
  ctx: NodeExecutionContext<any>;
  node: TNodeConfig;
}>;

export type NodeBackedToolOutputMapperArgs<
  TNodeConfig extends RunnableNodeConfig<any, any>,
  TToolInput = unknown,
> = Readonly<{
  input: TToolInput;
  item: Item;
  itemIndex: number;
  items: Items;
  ctx: NodeExecutionContext<any>;
  node: TNodeConfig;
  outputs: NodeOutputs;
}>;

export type NodeBackedToolInputMapper<TNodeConfig extends RunnableNodeConfig<any, any>, TToolInput = unknown> = (
  args: NodeBackedToolInputMapperArgs<TNodeConfig, TToolInput>,
) => Item<RunnableNodeInputJson<TNodeConfig>> | RunnableNodeInputJson<TNodeConfig>;

export type NodeBackedToolOutputMapper<
  TNodeConfig extends RunnableNodeConfig<any, any>,
  TToolInput = unknown,
  TToolOutput = unknown,
> = (args: NodeBackedToolOutputMapperArgs<TNodeConfig, TToolInput>) => TToolOutput;

export type NodeBackedToolConfigOptions<
  TNodeConfig extends RunnableNodeConfig<any, any>,
  TInputSchema extends ZodSchemaAny,
  TOutputSchema extends ZodSchemaAny,
> = Readonly<{
  description?: string;
  presentation?: AgentCanvasPresentation;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  mapInput?: NodeBackedToolInputMapper<TNodeConfig, ZodInput<TInputSchema>>;
  mapOutput?: NodeBackedToolOutputMapper<TNodeConfig, ZodInput<TInputSchema>, ZodOutput<TOutputSchema>>;
}>;

export interface AgentNodeConfig<TInputJson = unknown, TOutputJson = unknown> extends RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly messages: AgentMessageConfig<TInputJson>;
  readonly chatModel: ChatModelConfig;
  readonly tools?: ReadonlyArray<ToolConfig>;
  readonly guardrails?: AgentGuardrailConfig;
}

export type AgentAttachmentRole = "languageModel" | "tool" | "nestedAgent";

export { NodeBackedToolConfig } from "./NodeBackedToolConfig";
export { CallableToolConfig } from "./CallableToolConfig";
export type { CallableToolConfigOptions, CallableToolExecuteHandler } from "./CallableToolConfig";
export { CallableToolFactory } from "./CallableToolFactory";
export { CallableToolKindToken } from "./CallableToolKindToken";
export { AgentToolFactory } from "./AgentToolFactory";
export { AgentMessageConfigNormalizer } from "./AgentMessageConfigNormalizerFactory";
export { AgentConfigInspector } from "./AgentConfigInspectorFactory";

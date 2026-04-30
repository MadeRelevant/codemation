import type { TypeToken } from "../di";

import type { CredentialRequirement } from "../contracts/credentialTypes";
import type { Expr } from "../contracts/params";

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
  /**
   * Optional sub-agent boundary hooks: when present, the live `agent.tool.call` span and the
   * planned tool-call invocationId are forwarded so node-backed runtimes can re-root their child
   * execution scope. Plain function tools may safely ignore these hooks.
   */
  hooks?: Readonly<{
    parentSpan?: import("../contracts/telemetryTypes").TelemetrySpanScope;
    parentInvocationId?: import("../contracts/runTypes").ConnectionInvocationId;
  }>;
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
  | Expr<ReadonlyArray<AgentMessageLine<TInputJson>>, TInputJson>
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
  readonly provider?: string;
  readonly modelName?: string;
  readonly presentation?: AgentCanvasPresentation;
  getCredentialRequirements?(): ReadonlyArray<CredentialRequirement>;
}

/**
 * Provider-neutral chat language model wrapper returned by a {@link ChatModelFactory}.
 *
 * Thin adapter around an AI SDK `LanguageModelV2` (from `@ai-sdk/provider`) plus the call-site
 * defaults Codemation needs at every generate/stream: the provider label, the model name used for
 * pricing / telemetry, and the default invocation options (max output tokens, temperature,
 * provider-specific overrides).
 *
 * The consumer (AIAgentNode / AgentStructuredOutputRunner) passes `languageModel` directly into
 * `generateText({ model, ... })` from the `ai` package.
 */
export interface ChatLanguageModel {
  /** AI SDK `LanguageModelV2` instance (kept `unknown` to avoid leaking the SDK type into `@codemation/core`). */
  readonly languageModel: unknown;
  /** Stable pricing/telemetry key — e.g. `"gpt-4.1-nano"`. */
  readonly modelName: string;
  /** Provider label — e.g. `"openai"`. Used for cost tracking. */
  readonly provider?: string;
  /** Defaults merged into every call. Consumers may override per-invocation. */
  readonly defaultCallOptions?: ChatLanguageModelCallOptions;
}

export interface ChatLanguageModelCallOptions {
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly providerOptions?: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;
}

/**
 * Options for a structured-output generate call. Mirrors
 * `generateText({ output: Output.object(...) })` from the `ai` package.
 */
export interface StructuredOutputOptions {
  /** Optional schema name — used by some providers as the JSON schema name attribute. */
  readonly schemaName?: string;
  /** When `true`, the consumer should pass a strict-mode-compatible JSON Schema record. */
  readonly strict?: boolean;
}

export interface ChatModelFactory<TConfig extends ChatModelConfig = ChatModelConfig> {
  create(
    args: Readonly<{ config: TConfig; ctx: NodeExecutionContext<any> }>,
  ): Promise<ChatLanguageModel> | ChatLanguageModel;
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
  readonly outputSchema?: ZodType<TOutputJson>;
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

import type {
  AgentGuardrailConfig,
  AgentToolCall,
  ChatLanguageModel,
  ChatLanguageModelCallOptions,
  ChatModelConfig,
  ChatModelFactory,
  Item,
  Items,
  JsonValue,
  NodeExecutionContext,
  NodeInputsByPort,
  RunnableNode,
  RunnableNodeExecuteArgs,
  Tool,
  ToolConfig,
  ZodSchemaAny,
} from "@codemation/core";

import type { CredentialSessionService } from "@codemation/core";
import {
  AgentGuardrailDefaults,
  AgentMessageConfigNormalizer,
  CallableToolConfig,
  CodemationTelemetryAttributeNames,
  CodemationTelemetryMetricNames,
  ConnectionInvocationIdFactory,
  ConnectionNodeIdFactory,
  CoreTokens,
  GenAiTelemetryAttributeNames,
  NodeBackedToolConfig,
  inject,
  node,
  type NodeResolver,
} from "@codemation/core";

import type { AssistantModelMessage, GenerateTextResult, LanguageModel, ModelMessage, ToolSet } from "ai";
import { Output, generateText, jsonSchema } from "ai";

/**
 * OUTPUT generic must extend AI SDK's `Output<OUTPUT, PARTIAL, ELEMENT>` which is parametric on
 * `any`; there is no narrower concrete type we can substitute that accepts both text-only and
 * structured turns uniformly.
 */
type AnyGenerateTextResult = GenerateTextResult<ToolSet, any>;
import { z } from "zod";

import type { AIAgent } from "./AIAgentConfig";
import { AIAgentExecutionHelpersFactory } from "./AIAgentExecutionHelpersFactory";
import { AgentToolExecutionCoordinator } from "./AgentToolExecutionCoordinator";
import { ConnectionCredentialExecutionContextFactory } from "./ConnectionCredentialExecutionContextFactory";
import { AgentMessageFactory } from "./AgentMessageFactory";
import { AgentOutputFactory } from "./AgentOutputFactory";
import { AgentStructuredOutputRunner } from "./AgentStructuredOutputRunner";
import { AgentToolCallPortMap } from "./AgentToolCallPortMapFactory";
import { NodeBackedToolRuntime } from "./NodeBackedToolRuntime";
import {
  AgentItemPortMap,
  type ExecutedToolCall,
  type ItemScopedToolBinding,
  type PlannedToolCall,
  type ResolvedTool,
} from "./aiAgentSupport.types";

type ResolvedGuardrails = Required<Pick<AgentGuardrailConfig, "maxTurns" | "onTurnLimitReached">> &
  Pick<AgentGuardrailConfig, "modelInvocationOptions">;

/** Everything needed to run the agent loop for one item (shared across items in the same activation). */
interface PreparedAgentExecution {
  readonly ctx: NodeExecutionContext<AIAgent<any, any>>;
  readonly model: ChatLanguageModel;
  readonly resolvedTools: ReadonlyArray<ResolvedTool>;
  readonly guardrails: ResolvedGuardrails;
  readonly languageModelConnectionNodeId: string;
}

/** Result of one `generateText` turn with tools disabled for auto-execution. */
interface TurnResult {
  readonly assistantMessage: AssistantModelMessage | undefined;
  readonly text: string;
  readonly toolCalls: ReadonlyArray<AgentToolCall>;
  readonly usage: ModelUsage;
}

interface ModelUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
}

@node({ packageName: "@codemation/core-nodes" })
export class AIAgentNode implements RunnableNode<AIAgent<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;
  readonly inputSchema = z.unknown();

  private readonly connectionCredentialExecutionContextFactory: ConnectionCredentialExecutionContextFactory;
  private readonly preparedByExecutionContext = new WeakMap<
    NodeExecutionContext<AIAgent<any, any>>,
    Promise<PreparedAgentExecution>
  >();

  constructor(
    @inject(CoreTokens.NodeResolver)
    private readonly nodeResolver: NodeResolver,
    @inject(CoreTokens.CredentialSessionService)
    credentialSessions: CredentialSessionService,
    @inject(NodeBackedToolRuntime)
    private readonly nodeBackedToolRuntime: NodeBackedToolRuntime,
    @inject(AIAgentExecutionHelpersFactory)
    private readonly executionHelpers: AIAgentExecutionHelpersFactory,
    @inject(AgentStructuredOutputRunner)
    private readonly structuredOutputRunner: AgentStructuredOutputRunner,
    @inject(AgentToolExecutionCoordinator)
    private readonly toolExecutionCoordinator: AgentToolExecutionCoordinator,
  ) {
    this.connectionCredentialExecutionContextFactory =
      this.executionHelpers.createConnectionCredentialExecutionContextFactory(credentialSessions);
  }

  async execute(args: RunnableNodeExecuteArgs<AIAgent<any, any>>): Promise<unknown> {
    const prepared = await this.getOrPrepareExecution(args.ctx);
    const itemWithMappedJson = { ...args.item, json: args.input };
    const resultItem = await this.runAgentForItem(prepared, itemWithMappedJson, args.itemIndex, args.items);
    return resultItem.json;
  }

  private async getOrPrepareExecution(ctx: NodeExecutionContext<AIAgent<any, any>>): Promise<PreparedAgentExecution> {
    let pending = this.preparedByExecutionContext.get(ctx);
    if (!pending) {
      pending = this.prepareExecution(ctx);
      this.preparedByExecutionContext.set(ctx, pending);
    }
    try {
      return await pending;
    } catch (error) {
      this.preparedByExecutionContext.delete(ctx);
      throw error;
    }
  }

  private async prepareExecution(ctx: NodeExecutionContext<AIAgent<any, any>>): Promise<PreparedAgentExecution> {
    const chatModelFactory = this.nodeResolver.resolve(ctx.config.chatModel.type) as ChatModelFactory<ChatModelConfig>;
    const languageModelCredentialContext = this.connectionCredentialExecutionContextFactory.forConnectionNode(ctx, {
      connectionNodeId: ConnectionNodeIdFactory.languageModelConnectionNodeId(ctx.nodeId),
      getCredentialRequirements: () => ctx.config.chatModel.getCredentialRequirements?.() ?? [],
    });
    const model = await Promise.resolve(
      chatModelFactory.create({ config: ctx.config.chatModel, ctx: languageModelCredentialContext }),
    );
    return {
      ctx,
      model,
      resolvedTools: this.resolveTools(ctx.config.tools ?? []),
      guardrails: this.resolveGuardrails(ctx.config.guardrails),
      languageModelConnectionNodeId: ConnectionNodeIdFactory.languageModelConnectionNodeId(ctx.nodeId),
    };
  }

  private async runAgentForItem(
    prepared: PreparedAgentExecution,
    item: Item,
    itemIndex: number,
    items: Items,
  ): Promise<Item> {
    const { ctx } = prepared;
    const itemInputsByPort = AgentItemPortMap.fromItem(item);
    const itemScopedTools = this.createItemScopedTools(prepared.resolvedTools, ctx, item, itemIndex, items);
    const conversation: ModelMessage[] = [...this.createPromptMessages(item, itemIndex, items, ctx)];
    if (ctx.config.outputSchema && itemScopedTools.length === 0) {
      const structuredOutput = await this.structuredOutputRunner.resolve({
        model: prepared.model,
        chatModelConfig: ctx.config.chatModel,
        schema: ctx.config.outputSchema,
        conversation,
        agentName: this.getAgentDisplayName(ctx),
        nodeId: ctx.nodeId,
        invokeTextModel: async (messages) => await this.invokeTextTurn(prepared, itemInputsByPort, messages, []),
        invokeStructuredModel: async (schema, messages, structuredOptions) =>
          await this.invokeStructuredTurn(prepared, itemInputsByPort, schema, messages, structuredOptions),
      });
      await ctx.telemetry.recordMetric({ name: CodemationTelemetryMetricNames.agentTurns, value: 1 });
      await ctx.telemetry.recordMetric({ name: CodemationTelemetryMetricNames.agentToolCalls, value: 0 });
      return this.buildOutputItem(item, structuredOutput);
    }
    const loopResult = await this.runTurnLoopUntilFinalAnswer({
      prepared,
      itemInputsByPort,
      itemScopedTools,
      conversation,
    });
    await ctx.telemetry.recordMetric({ name: CodemationTelemetryMetricNames.agentTurns, value: loopResult.turnCount });
    await ctx.telemetry.recordMetric({
      name: CodemationTelemetryMetricNames.agentToolCalls,
      value: loopResult.toolCallCount,
    });
    const outputJson = await this.resolveFinalOutputJson(
      prepared,
      itemInputsByPort,
      conversation,
      loopResult.finalText,
      itemScopedTools.length > 0,
    );
    return this.buildOutputItem(item, outputJson);
  }

  /**
   * Multi-turn loop:
   * - Each turn is a single `generateText` call with tools exposed but **not auto-executed**
   *   (we control tool dispatch so that {@link AgentToolExecutionCoordinator} drives repair /
   *   connection-invocation recording / transient-error handling exactly like before).
   * - When the model returns no tool calls the loop ends with the model's text as the final answer.
   * - Respects `guardrails.maxTurns` and `guardrails.onTurnLimitReached`.
   */
  private async runTurnLoopUntilFinalAnswer(args: {
    prepared: PreparedAgentExecution;
    itemInputsByPort: NodeInputsByPort;
    itemScopedTools: ReadonlyArray<ItemScopedToolBinding>;
    conversation: ModelMessage[];
  }): Promise<Readonly<{ finalText: string; turnCount: number; toolCallCount: number }>> {
    const { prepared, itemInputsByPort, itemScopedTools, conversation } = args;
    const { ctx, guardrails } = prepared;

    let finalText = "";
    let toolCallCount = 0;
    let turnCount = 0;
    const repairAttemptsByToolName = new Map<string, number>();

    for (let turn = 1; turn <= guardrails.maxTurns; turn++) {
      turnCount = turn;
      const result = await this.invokeTextTurn(prepared, itemInputsByPort, conversation, itemScopedTools);
      finalText = result.text;

      if (result.toolCalls.length === 0) {
        break;
      }

      if (this.cannotExecuteAnotherToolRound(turn, guardrails)) {
        this.finishOrThrowWhenTurnCapHitWithToolCalls(ctx, guardrails);
        break;
      }

      const plannedToolCalls = this.planToolCalls(itemScopedTools, result.toolCalls, ctx.nodeId);
      toolCallCount += plannedToolCalls.length;
      await this.markQueuedTools(plannedToolCalls, ctx);
      const executedToolCalls = await this.toolExecutionCoordinator.execute({
        plannedToolCalls,
        ctx,
        agentName: this.getAgentDisplayName(ctx),
        repairAttemptsByToolName,
      });
      this.appendAssistantAndToolMessages(
        conversation,
        result.assistantMessage,
        result.text,
        result.toolCalls,
        executedToolCalls,
      );
    }

    return {
      finalText,
      turnCount,
      toolCallCount,
    };
  }

  private cannotExecuteAnotherToolRound(turn: number, guardrails: ResolvedGuardrails): boolean {
    return turn >= guardrails.maxTurns;
  }

  private finishOrThrowWhenTurnCapHitWithToolCalls(
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    guardrails: ResolvedGuardrails,
  ): void {
    if (guardrails.onTurnLimitReached === "respondWithLastMessage") {
      return;
    }
    throw new Error(
      `AIAgent "${ctx.config.name ?? ctx.nodeId}" reached maxTurns=${guardrails.maxTurns} before producing a final response.`,
    );
  }

  private appendAssistantAndToolMessages(
    conversation: ModelMessage[],
    assistantMessage: AssistantModelMessage | undefined,
    text: string,
    toolCalls: ReadonlyArray<AgentToolCall>,
    executedToolCalls: ReadonlyArray<ExecutedToolCall>,
  ): void {
    conversation.push(
      assistantMessage ?? AgentMessageFactory.createAssistantWithToolCalls(text, toolCalls),
      AgentMessageFactory.createToolResultsMessage(executedToolCalls),
    );
  }

  private async resolveFinalOutputJson(
    prepared: PreparedAgentExecution,
    itemInputsByPort: NodeInputsByPort,
    conversation: ReadonlyArray<ModelMessage>,
    finalText: string,
    wasToolEnabledRun: boolean,
  ): Promise<unknown> {
    if (!prepared.ctx.config.outputSchema) {
      return AgentOutputFactory.fromAgentContent(finalText);
    }
    const conversationWithFinal: ReadonlyArray<ModelMessage> = wasToolEnabledRun
      ? [...conversation, { role: "assistant", content: finalText }]
      : conversation;
    return await this.structuredOutputRunner.resolve({
      model: prepared.model,
      chatModelConfig: prepared.ctx.config.chatModel,
      schema: prepared.ctx.config.outputSchema,
      conversation: conversationWithFinal,
      rawFinalText: finalText,
      agentName: this.getAgentDisplayName(prepared.ctx),
      nodeId: prepared.ctx.nodeId,
      invokeTextModel: async (messages) => await this.invokeTextTurn(prepared, itemInputsByPort, messages, []),
      invokeStructuredModel: async (schema, messages, structuredOptions) =>
        await this.invokeStructuredTurn(prepared, itemInputsByPort, schema, messages, structuredOptions),
    });
  }

  private buildOutputItem(item: Item, outputJson: unknown): Item {
    return AgentOutputFactory.replaceJson(item, outputJson);
  }

  private resolveTools(toolConfigs: ReadonlyArray<ToolConfig>): ReadonlyArray<ResolvedTool> {
    const resolvedTools = toolConfigs.map((config) => ({
      config,
      runtime: this.resolveToolRuntime(config),
    }));

    const names = new Set<string>();
    for (const entry of resolvedTools) {
      if (names.has(entry.config.name)) throw new Error(`Duplicate tool name on AIAgent: ${entry.config.name}`);
      names.add(entry.config.name);
    }
    return resolvedTools;
  }

  private createItemScopedTools(
    tools: ReadonlyArray<ResolvedTool>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    item: Item,
    itemIndex: number,
    items: Items,
  ): ReadonlyArray<ItemScopedToolBinding> {
    return tools.map((entry) => {
      const toolCredentialContext = this.connectionCredentialExecutionContextFactory.forConnectionNode(ctx, {
        connectionNodeId: ConnectionNodeIdFactory.toolConnectionNodeId(ctx.nodeId, entry.config.name),
        getCredentialRequirements: () => entry.config.getCredentialRequirements?.() ?? [],
      });
      return {
        config: entry.config,
        inputSchema: entry.runtime.inputSchema,
        execute: async (input, hooks): Promise<unknown> => {
          const validated = entry.runtime.inputSchema.parse(input) as unknown;
          return await entry.runtime.execute({
            config: entry.config,
            input: validated,
            ctx: toolCredentialContext,
            item,
            itemIndex,
            items,
            hooks,
          });
        },
      } satisfies ItemScopedToolBinding;
    });
  }

  /**
   * Builds an AI SDK {@link ToolSet} where every tool ships a pre-converted JSON Schema (via
   * {@link jsonSchema}) — not the raw Zod schema — and carries **no** `execute`. Two reasons:
   *
   * 1. Codemation owns tool dispatch + the per-tool repair loop (see {@link AgentToolExecutionCoordinator}),
   *    so the AI SDK must surface tool calls back to us instead of auto-running them.
   * 2. The AI SDK's `asSchema` helper discriminates between Zod v3 / Zod v4 / Standard Schema via
   *    runtime feature-detection (`~standard`, `_zod`, etc.). Handing it a pre-built
   *    {@link jsonSchema} record — which is tagged with `Symbol.for('vercel.ai.schema')` — skips all
   *    of that detection and guarantees the provider receives a draft-07 JSON Schema with
   *    `additionalProperties: false` at every object depth (see {@link OpenAiStrictJsonSchemaFactory}
   *    for the same logic applied to structured-output schemas). Codemation still runs its own Zod
   *    validation on tool inputs before execute — the schema handed to the model is advisory.
   */
  private buildToolSet(itemScopedTools: ReadonlyArray<ItemScopedToolBinding>): ToolSet | undefined {
    if (itemScopedTools.length === 0) return undefined;
    const toolSet: Record<string, { description?: string; inputSchema: ReturnType<typeof jsonSchema> }> = {};
    for (const entry of itemScopedTools) {
      const schemaRecord = this.executionHelpers.createJsonSchemaRecord(entry.inputSchema, {
        schemaName: entry.config.name,
        requireObjectRoot: true,
      });
      toolSet[entry.config.name] = {
        description: entry.config.description,
        inputSchema: jsonSchema(schemaRecord as Parameters<typeof jsonSchema>[0]),
      };
    }
    return toolSet as unknown as ToolSet;
  }

  /**
   * One `generateText` turn (no auto tool execution) with Codemation-owned child-span telemetry
   * and connection-invocation state recording.
   */
  private async invokeTextTurn(
    prepared: PreparedAgentExecution,
    itemInputsByPort: NodeInputsByPort,
    messages: ReadonlyArray<ModelMessage>,
    itemScopedTools: ReadonlyArray<ItemScopedToolBinding>,
  ): Promise<TurnResult> {
    const invocationId = ConnectionInvocationIdFactory.create();
    const startedAt = new Date();
    const summarizedInput = this.summarizeLlmMessages(messages);
    const { ctx, model, languageModelConnectionNodeId, guardrails } = prepared;
    const span = this.createModelInvocationSpan(ctx, invocationId, startedAt);
    await ctx.nodeState?.markQueued({
      nodeId: languageModelConnectionNodeId,
      activationId: ctx.activationId,
      inputsByPort: itemInputsByPort,
    });
    await ctx.nodeState?.appendConnectionInvocation({
      invocationId,
      connectionNodeId: languageModelConnectionNodeId,
      parentAgentNodeId: ctx.nodeId,
      parentAgentActivationId: ctx.activationId,
      status: "queued",
      managedInput: summarizedInput,
      queuedAt: startedAt.toISOString(),
      iterationId: ctx.iterationId,
      itemIndex: ctx.itemIndex,
      parentInvocationId: ctx.parentInvocationId,
    });
    await ctx.nodeState?.markRunning({
      nodeId: languageModelConnectionNodeId,
      activationId: ctx.activationId,
      inputsByPort: itemInputsByPort,
    });
    await ctx.nodeState?.appendConnectionInvocation({
      invocationId,
      connectionNodeId: languageModelConnectionNodeId,
      parentAgentNodeId: ctx.nodeId,
      parentAgentActivationId: ctx.activationId,
      status: "running",
      managedInput: summarizedInput,
      queuedAt: startedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      iterationId: ctx.iterationId,
      itemIndex: ctx.itemIndex,
      parentInvocationId: ctx.parentInvocationId,
    });
    try {
      const tools = this.buildToolSet(itemScopedTools);
      const callOptions = this.resolveCallOptions(model, guardrails.modelInvocationOptions);
      const result = await generateText({
        model: model.languageModel as LanguageModel,
        messages: [...messages],
        tools,
        toolChoice: tools ? "auto" : undefined,
        maxOutputTokens: callOptions.maxOutputTokens,
        temperature: callOptions.temperature,
        providerOptions: callOptions.providerOptions as Record<string, Record<string, never>>,
        maxRetries: 0,
      });
      const turnResult = this.extractTurnResult(result as AnyGenerateTextResult);
      const finishedAt = new Date();
      const managedOutput = this.summarizeTurnOutput(turnResult);
      await ctx.nodeState?.markCompleted({
        nodeId: languageModelConnectionNodeId,
        activationId: ctx.activationId,
        inputsByPort: itemInputsByPort,
        outputs: AgentOutputFactory.fromUnknown(managedOutput),
      });
      await span.attachArtifact({ kind: "ai.messages", contentType: "application/json", previewJson: summarizedInput });
      await span.attachArtifact({ kind: "ai.response", contentType: "application/json", previewJson: turnResult.text });
      await this.recordModelUsageMetrics(span, turnResult.usage, ctx);
      await span.end({ status: "ok", endedAt: finishedAt });
      await ctx.nodeState?.appendConnectionInvocation({
        invocationId,
        connectionNodeId: languageModelConnectionNodeId,
        parentAgentNodeId: ctx.nodeId,
        parentAgentActivationId: ctx.activationId,
        status: "completed",
        managedInput: summarizedInput,
        managedOutput,
        queuedAt: startedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        iterationId: ctx.iterationId,
        itemIndex: ctx.itemIndex,
        parentInvocationId: ctx.parentInvocationId,
      });
      return turnResult;
    } catch (error) {
      await span.end({
        status: "error",
        statusMessage: error instanceof Error ? error.message : String(error),
        endedAt: new Date(),
      });
      throw await this.failTrackedNodeInvocation({
        error,
        invocationId,
        startedAt,
        nodeId: languageModelConnectionNodeId,
        ctx,
        inputsByPort: itemInputsByPort,
        managedInput: summarizedInput,
      });
    }
  }

  /**
   * Structured-output turn: runs `generateText({ output: Output.object({ schema }) })` via the
   * structured-output runner.  We keep this as a separate helper because the runner needs the raw
   * validated value (not just text) back, and must be able to retry on Zod failures.
   */
  private async invokeStructuredTurn(
    prepared: PreparedAgentExecution,
    itemInputsByPort: NodeInputsByPort,
    schema: ZodSchemaAny | Readonly<Record<string, unknown>>,
    messages: ReadonlyArray<ModelMessage>,
    structuredOptions: { readonly strict?: boolean; readonly schemaName?: string } | undefined,
  ): Promise<unknown> {
    const invocationId = ConnectionInvocationIdFactory.create();
    const startedAt = new Date();
    const summarizedInput = this.summarizeLlmMessages(messages);
    const { ctx, model, languageModelConnectionNodeId, guardrails } = prepared;
    const span = this.createModelInvocationSpan(ctx, invocationId, startedAt);
    await ctx.nodeState?.markQueued({
      nodeId: languageModelConnectionNodeId,
      activationId: ctx.activationId,
      inputsByPort: itemInputsByPort,
    });
    await ctx.nodeState?.appendConnectionInvocation({
      invocationId,
      connectionNodeId: languageModelConnectionNodeId,
      parentAgentNodeId: ctx.nodeId,
      parentAgentActivationId: ctx.activationId,
      status: "queued",
      managedInput: summarizedInput,
      queuedAt: startedAt.toISOString(),
      iterationId: ctx.iterationId,
      itemIndex: ctx.itemIndex,
      parentInvocationId: ctx.parentInvocationId,
    });
    await ctx.nodeState?.markRunning({
      nodeId: languageModelConnectionNodeId,
      activationId: ctx.activationId,
      inputsByPort: itemInputsByPort,
    });
    await ctx.nodeState?.appendConnectionInvocation({
      invocationId,
      connectionNodeId: languageModelConnectionNodeId,
      parentAgentNodeId: ctx.nodeId,
      parentAgentActivationId: ctx.activationId,
      status: "running",
      managedInput: summarizedInput,
      queuedAt: startedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      iterationId: ctx.iterationId,
      itemIndex: ctx.itemIndex,
      parentInvocationId: ctx.parentInvocationId,
    });
    try {
      const callOptions = this.resolveCallOptions(model, guardrails.modelInvocationOptions);
      const outputSchema =
        structuredOptions?.strict && !this.isZodSchema(schema)
          ? Output.object({ schema: jsonSchema(schema as Parameters<typeof jsonSchema>[0]) as never })
          : Output.object({ schema: schema as ZodSchemaAny });
      const result = await generateText({
        model: model.languageModel as LanguageModel,
        messages: [...messages],
        experimental_output: outputSchema,
        maxOutputTokens: callOptions.maxOutputTokens,
        temperature: callOptions.temperature,
        providerOptions: callOptions.providerOptions as Record<string, Record<string, never>>,
        maxRetries: 0,
      });
      const turnResult = this.extractTurnResult(result as AnyGenerateTextResult);
      const finishedAt = new Date();
      await ctx.nodeState?.markCompleted({
        nodeId: languageModelConnectionNodeId,
        activationId: ctx.activationId,
        inputsByPort: itemInputsByPort,
        outputs: AgentOutputFactory.fromUnknown(result.experimental_output),
      });
      await span.attachArtifact({ kind: "ai.messages", contentType: "application/json", previewJson: summarizedInput });
      await span.attachArtifact({
        kind: "ai.response.structured",
        contentType: "application/json",
        previewJson: this.resultToJsonValue(result.experimental_output),
      });
      await this.recordModelUsageMetrics(span, turnResult.usage, ctx);
      await span.end({ status: "ok", endedAt: finishedAt });
      await ctx.nodeState?.appendConnectionInvocation({
        invocationId,
        connectionNodeId: languageModelConnectionNodeId,
        parentAgentNodeId: ctx.nodeId,
        parentAgentActivationId: ctx.activationId,
        status: "completed",
        managedInput: summarizedInput,
        managedOutput: this.resultToJsonValue(result.experimental_output),
        queuedAt: startedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        iterationId: ctx.iterationId,
        itemIndex: ctx.itemIndex,
        parentInvocationId: ctx.parentInvocationId,
      });
      return result.experimental_output;
    } catch (error) {
      await span.end({
        status: "error",
        statusMessage: error instanceof Error ? error.message : String(error),
        endedAt: new Date(),
      });
      throw await this.failTrackedNodeInvocation({
        error,
        invocationId,
        startedAt,
        nodeId: languageModelConnectionNodeId,
        ctx,
        inputsByPort: itemInputsByPort,
        managedInput: summarizedInput,
      });
    }
  }

  private isZodSchema(schema: ZodSchemaAny | Readonly<Record<string, unknown>>): schema is ZodSchemaAny {
    const candidate = schema as { parse?: unknown };
    return typeof candidate.parse === "function";
  }

  private resolveCallOptions(
    model: ChatLanguageModel,
    overrides: AgentGuardrailConfig["modelInvocationOptions"] | undefined,
  ): ChatLanguageModelCallOptions {
    const defaults = model.defaultCallOptions ?? {};
    return {
      maxOutputTokens: overrides?.maxTokens ?? defaults.maxOutputTokens,
      temperature: defaults.temperature,
      providerOptions: (overrides?.providerOptions ??
        defaults.providerOptions) as ChatLanguageModelCallOptions["providerOptions"],
    };
  }

  /**
   * Build a no-code-friendly output payload for an LLM round.
   *
   * Always includes `content` (matching the canvas snapshot shape used elsewhere) and adds a
   * `toolCalls` array when the round produced tool calls so the execution inspector surfaces the
   * planned calls instead of just an empty `""` for tool-only rounds.
   */
  private summarizeTurnOutput(turnResult: TurnResult): JsonValue {
    if (turnResult.toolCalls.length === 0) return { content: turnResult.text };
    const toolCalls = turnResult.toolCalls.map((toolCall) => ({
      name: toolCall.name,
      args: this.resultToJsonValue(toolCall.input) ?? null,
    }));
    return { content: turnResult.text, toolCalls };
  }

  private extractTurnResult(result: AnyGenerateTextResult): TurnResult {
    const usage = this.extractUsageFromResult(result);
    const text = result.text;
    const toolCalls: ReadonlyArray<AgentToolCall> = result.toolCalls.map((toolCall) => ({
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      input: (toolCall as { input?: unknown }).input,
    }));
    const assistantMessage = this.extractAssistantMessage(result);
    return {
      assistantMessage,
      text,
      toolCalls,
      usage,
    };
  }

  private extractAssistantMessage(result: AnyGenerateTextResult): AssistantModelMessage | undefined {
    const responseMessages: ReadonlyArray<ModelMessage> = result.response.messages;
    const assistantMessages = responseMessages.filter((m) => m.role === "assistant");
    return assistantMessages[assistantMessages.length - 1];
  }

  private extractUsageFromResult(result: AnyGenerateTextResult): ModelUsage {
    const usage = result.usage;
    const inputTokens = this.toFiniteNumber(usage.inputTokens);
    const outputTokens = this.toFiniteNumber(usage.outputTokens);
    const totalTokens =
      this.toFiniteNumber(usage.totalTokens) ??
      (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined);
    const cachedInputTokens = this.toFiniteNumber(usage.cachedInputTokens);
    const reasoningTokens = this.toFiniteNumber(usage.reasoningTokens);
    return { inputTokens, outputTokens, totalTokens, cachedInputTokens, reasoningTokens };
  }

  private toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return value;
  }

  private createModelInvocationSpan(
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    invocationId: string,
    startedAt: Date,
  ) {
    return ctx.telemetry.startChildSpan({
      name: "gen_ai.chat.completion",
      kind: "client",
      startedAt,
      attributes: {
        [CodemationTelemetryAttributeNames.connectionInvocationId]: invocationId,
        [GenAiTelemetryAttributeNames.operationName]: "chat",
        [GenAiTelemetryAttributeNames.requestModel]: this.resolveChatModelName(ctx.config.chatModel),
        ...(ctx.iterationId ? { [CodemationTelemetryAttributeNames.iterationId]: ctx.iterationId } : {}),
        ...(typeof ctx.itemIndex === "number"
          ? { [CodemationTelemetryAttributeNames.iterationIndex]: ctx.itemIndex }
          : {}),
        ...(ctx.parentInvocationId
          ? { [CodemationTelemetryAttributeNames.parentInvocationId]: ctx.parentInvocationId }
          : {}),
      },
    });
  }

  private async recordModelUsageMetrics(
    span: ReturnType<NodeExecutionContext["telemetry"]["startChildSpan"]>,
    usage: ModelUsage,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
  ) {
    const entries: ReadonlyArray<readonly [string, number | undefined]> = [
      [GenAiTelemetryAttributeNames.usageInputTokens, usage.inputTokens],
      [GenAiTelemetryAttributeNames.usageOutputTokens, usage.outputTokens],
      [GenAiTelemetryAttributeNames.usageTotalTokens, usage.totalTokens],
      [GenAiTelemetryAttributeNames.usageCacheReadInputTokens, usage.cachedInputTokens],
      [GenAiTelemetryAttributeNames.usageReasoningTokens, usage.reasoningTokens],
    ];
    for (const [name, value] of entries) {
      if (value === undefined) continue;
      await span.recordMetric({ name, value });
    }
    await this.captureCostTrackingUsage(span, ctx, usage);
  }

  private async captureCostTrackingUsage(
    span: ReturnType<NodeExecutionContext["telemetry"]["startChildSpan"]>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    usage: ModelUsage,
  ): Promise<void> {
    const costTracking = span.costTracking;
    if (!costTracking) return;
    const provider = ctx.config.chatModel.provider;
    const pricingKey = ctx.config.chatModel.modelName;
    if (!provider || !pricingKey) return;
    if (usage.inputTokens !== undefined) {
      await costTracking.captureUsage({
        component: "chat",
        provider,
        operation: "completion.input",
        pricingKey,
        usageUnit: "input_tokens",
        quantity: usage.inputTokens,
        modelName: pricingKey,
      });
    }
    if (usage.outputTokens !== undefined) {
      await costTracking.captureUsage({
        component: "chat",
        provider,
        operation: "completion.output",
        pricingKey,
        usageUnit: "output_tokens",
        quantity: usage.outputTokens,
        modelName: pricingKey,
      });
    }
  }

  private resolveChatModelName(chatModel: ChatModelConfig): string {
    return chatModel.modelName ?? chatModel.name;
  }

  private async markQueuedTools(
    plannedToolCalls: ReadonlyArray<PlannedToolCall>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
  ): Promise<void> {
    const queuedAt = new Date().toISOString();
    for (const plannedToolCall of plannedToolCalls) {
      await ctx.nodeState?.markQueued({
        nodeId: plannedToolCall.nodeId,
        activationId: ctx.activationId,
        inputsByPort: AgentToolCallPortMap.fromInput(plannedToolCall.toolCall.input ?? {}),
      });
      await ctx.nodeState?.appendConnectionInvocation({
        invocationId: plannedToolCall.invocationId,
        connectionNodeId: plannedToolCall.nodeId,
        parentAgentNodeId: ctx.nodeId,
        parentAgentActivationId: ctx.activationId,
        status: "queued",
        managedInput: this.resultToJsonValue(plannedToolCall.toolCall.input),
        queuedAt,
        iterationId: ctx.iterationId,
        itemIndex: ctx.itemIndex,
        parentInvocationId: ctx.parentInvocationId,
      });
    }
  }

  private planToolCalls(
    bindings: ReadonlyArray<ItemScopedToolBinding>,
    toolCalls: ReadonlyArray<AgentToolCall>,
    parentNodeId: string,
  ): ReadonlyArray<PlannedToolCall> {
    const invocationCountByToolName = new Map<string, number>();
    return toolCalls.map((toolCall) => {
      const binding = bindings.find((entry) => entry.config.name === toolCall.name);
      if (!binding) throw new Error(`Unknown tool requested by model: ${toolCall.name}`);
      const invocationIndex = (invocationCountByToolName.get(binding.config.name) ?? 0) + 1;
      invocationCountByToolName.set(binding.config.name, invocationIndex);
      return {
        binding,
        toolCall,
        invocationIndex,
        nodeId: ConnectionNodeIdFactory.toolConnectionNodeId(parentNodeId, binding.config.name),
        invocationId: ConnectionInvocationIdFactory.create(),
      } satisfies PlannedToolCall;
    });
  }

  private async failTrackedNodeInvocation(
    args: Readonly<{
      error: unknown;
      invocationId: string;
      startedAt: Date;
      nodeId: string;
      ctx: NodeExecutionContext<AIAgent<any, any>>;
      inputsByPort: NodeInputsByPort;
      managedInput?: JsonValue;
    }>,
  ): Promise<Error> {
    const effectiveError = args.error instanceof Error ? args.error : new Error(String(args.error));
    const finishedAt = new Date();
    await args.ctx.nodeState?.markFailed({
      nodeId: args.nodeId,
      activationId: args.ctx.activationId,
      inputsByPort: args.inputsByPort,
      error: effectiveError,
    });
    await args.ctx.nodeState?.appendConnectionInvocation({
      invocationId: args.invocationId,
      connectionNodeId: args.nodeId,
      parentAgentNodeId: args.ctx.nodeId,
      parentAgentActivationId: args.ctx.activationId,
      status: "failed",
      managedInput: args.managedInput,
      error: {
        message: effectiveError.message,
        name: effectiveError.name,
        stack: effectiveError.stack,
        details: this.extractErrorDetails(effectiveError),
      },
      queuedAt: args.startedAt.toISOString(),
      startedAt: args.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      iterationId: args.ctx.iterationId,
      itemIndex: args.ctx.itemIndex,
      parentInvocationId: args.ctx.parentInvocationId,
    });
    return effectiveError;
  }

  private summarizeLlmMessages(messages: ReadonlyArray<ModelMessage>): JsonValue {
    const last = messages[messages.length - 1];
    const preview =
      typeof last?.content === "string"
        ? last.content
        : last?.content !== undefined
          ? JSON.stringify(last.content)
          : "";
    return {
      messageCount: messages.length,
      lastMessagePreview: preview.slice(0, 4000),
    };
  }

  private resultToJsonValue(value: unknown): JsonValue | undefined {
    if (value === undefined) return undefined;
    const json = JSON.stringify(value);
    return JSON.parse(json) as JsonValue;
  }

  private createPromptMessages(
    item: Item,
    itemIndex: number,
    items: Items,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
  ): ReadonlyArray<ModelMessage> {
    return AgentMessageFactory.createPromptMessages(
      AgentMessageConfigNormalizer.resolveFromInputOrConfig(item.json, ctx.config, {
        item,
        itemIndex,
        items,
        ctx,
      }),
    );
  }

  private resolveToolRuntime(config: ToolConfig): ResolvedTool["runtime"] {
    if (this.isNodeBackedToolConfig(config)) {
      const inputSchema = config.getInputSchema();
      if (inputSchema == null) {
        throw new Error(
          `AIAgent tool "${config.name}": node-backed tool is missing inputSchema (cannot build AI SDK tool).`,
        );
      }
      return {
        defaultDescription: `Run workflow node "${config.node.name ?? config.name}" as an AI tool.`,
        inputSchema,
        execute: async (args) => await this.nodeBackedToolRuntime.execute(config, args),
      };
    }
    if (this.isCallableToolConfig(config)) {
      const inputSchema = config.getInputSchema();
      if (inputSchema == null) {
        throw new Error(
          `AIAgent tool "${config.name}": callable tool is missing inputSchema (cannot build AI SDK tool).`,
        );
      }
      return {
        defaultDescription: config.description ?? `Callable tool "${config.name}".`,
        inputSchema,
        execute: async (args) =>
          await config.executeTool({ ...args, config: config as CallableToolConfig<ZodSchemaAny, ZodSchemaAny> }),
      };
    }
    const tool = this.nodeResolver.resolve(config.type) as Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>;
    if (tool.inputSchema == null) {
      throw new Error(`AIAgent tool "${config.name}": plugin tool "${String(config.type)}" is missing inputSchema.`);
    }
    return {
      defaultDescription: tool.defaultDescription,
      inputSchema: tool.inputSchema,
      execute: async (args) => await Promise.resolve(tool.execute(args)),
    };
  }

  private isNodeBackedToolConfig(config: ToolConfig): config is NodeBackedToolConfig<any, any, any> {
    return (
      config instanceof NodeBackedToolConfig ||
      (typeof config === "object" && config !== null && (config as { toolKind?: unknown }).toolKind === "nodeBacked")
    );
  }

  private isCallableToolConfig(config: ToolConfig): config is CallableToolConfig<ZodSchemaAny, ZodSchemaAny> {
    return (
      config instanceof CallableToolConfig ||
      (typeof config === "object" && config !== null && (config as { toolKind?: unknown }).toolKind === "callable")
    );
  }

  private resolveGuardrails(guardrails: AgentGuardrailConfig | undefined): ResolvedGuardrails {
    const maxTurns = guardrails?.maxTurns ?? AgentGuardrailDefaults.maxTurns;
    if (!Number.isInteger(maxTurns) || maxTurns < 1) {
      throw new Error(`AIAgent maxTurns must be a positive integer. Received: ${String(maxTurns)}`);
    }
    return {
      maxTurns,
      onTurnLimitReached: guardrails?.onTurnLimitReached ?? AgentGuardrailDefaults.onTurnLimitReached,
      modelInvocationOptions: guardrails?.modelInvocationOptions,
    };
  }

  private getAgentDisplayName(ctx: NodeExecutionContext<AIAgent<any, any>>): string {
    return ctx.config.name ?? ctx.nodeId;
  }

  private extractErrorDetails(error: Error): JsonValue | undefined {
    const candidate = error as Error & { details?: JsonValue };
    return candidate.details;
  }
}

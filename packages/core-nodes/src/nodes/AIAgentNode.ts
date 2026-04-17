import type {
  AgentGuardrailConfig,
  AgentToolCall,
  ChatModelConfig,
  ChatModelFactory,
  Item,
  Items,
  JsonValue,
  LangChainChatModelLike,
  NodeExecutionContext,
  NodeInputsByPort,
  RunnableNode,
  RunnableNodeExecuteArgs,
  Tool,
  ToolConfig,
  LangChainStructuredOutputModelLike,
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

import { AIMessage, type BaseMessage } from "@langchain/core/messages";
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
  readonly model: LangChainChatModelLike;
  readonly resolvedTools: ReadonlyArray<ResolvedTool>;
  readonly guardrails: ResolvedGuardrails;
  readonly languageModelConnectionNodeId: string;
}

@node({ packageName: "@codemation/core-nodes" })
export class AIAgentNode implements RunnableNode<AIAgent<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;
  /**
   * Engine validates {@link RunnableNodeConfig.inputSchema} (Zod) on {@code item.json} before enqueue, then resolves
   * per-item **`itemExpr`** leaves on config before {@link #execute}. Prefer modeling prompts as
   * {@code { messages: [{ role, content }, ...] }} (on input or config) so persisted inputs are visible in the UI.
   */
  readonly inputSchema = z.unknown();

  private readonly connectionCredentialExecutionContextFactory: ConnectionCredentialExecutionContextFactory;
  /** One resolved model/tools bundle per activation context (same ctx across items in a batch). */
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

  /**
   * Resolves the chat model and tools once per activation, then reuses for every item in the batch.
   */
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

  /**
   * One item: build prompts, optionally bind tools, run the multi-turn loop, map the final model message to workflow JSON.
   */
  private async runAgentForItem(
    prepared: PreparedAgentExecution,
    item: Item,
    itemIndex: number,
    items: Items,
  ): Promise<Item> {
    const { ctx } = prepared;
    const itemInputsByPort = AgentItemPortMap.fromItem(item);
    const itemScopedTools = this.createItemScopedTools(prepared.resolvedTools, ctx, item, itemIndex, items);
    const conversation: BaseMessage[] = [...this.createPromptMessages(item, itemIndex, items, ctx)];
    if (ctx.config.outputSchema && itemScopedTools.length === 0) {
      const structuredOutput = await this.structuredOutputRunner.resolve({
        model: prepared.model,
        chatModelConfig: ctx.config.chatModel,
        schema: ctx.config.outputSchema,
        conversation,
        agentName: this.getAgentDisplayName(ctx),
        nodeId: ctx.nodeId,
        invokeTextModel: async (messages) =>
          await this.invokeModel(
            prepared.model,
            prepared.languageModelConnectionNodeId,
            messages,
            ctx,
            itemInputsByPort,
            prepared.guardrails.modelInvocationOptions,
          ),
        invokeStructuredModel: async (structuredModel, messages) =>
          await this.invokeStructuredModel(
            structuredModel,
            prepared.languageModelConnectionNodeId,
            messages,
            ctx,
            itemInputsByPort,
            prepared.guardrails.modelInvocationOptions,
          ),
      });
      await ctx.telemetry.recordMetric({ name: CodemationTelemetryMetricNames.agentTurns, value: 1 });
      await ctx.telemetry.recordMetric({ name: CodemationTelemetryMetricNames.agentToolCalls, value: 0 });
      return this.buildOutputItem(item, structuredOutput);
    }
    const modelWithTools = this.bindToolsToModel(prepared.model, itemScopedTools);
    const loopResult = await this.runTurnLoopUntilFinalAnswer({
      prepared,
      itemInputsByPort,
      itemScopedTools,
      conversation,
      modelWithTools,
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
      loopResult.finalResponse,
      itemScopedTools.length > 0,
    );
    return this.buildOutputItem(item, outputJson);
  }

  /**
   * Repeatedly invokes the model until it returns without tool calls, or guardrails end the loop.
   */
  private async runTurnLoopUntilFinalAnswer(args: {
    prepared: PreparedAgentExecution;
    itemInputsByPort: NodeInputsByPort;
    itemScopedTools: ReadonlyArray<ItemScopedToolBinding>;
    conversation: BaseMessage[];
    modelWithTools: LangChainChatModelLike;
  }): Promise<Readonly<{ finalResponse: AIMessage; turnCount: number; toolCallCount: number }>> {
    const { prepared, itemInputsByPort, itemScopedTools, conversation, modelWithTools } = args;
    const { ctx, guardrails, languageModelConnectionNodeId } = prepared;

    let finalResponse: AIMessage | undefined;
    let toolCallCount = 0;
    let turnCount = 0;
    const repairAttemptsByToolName = new Map<string, number>();

    for (let turn = 1; turn <= guardrails.maxTurns; turn++) {
      turnCount = turn;
      const response = await this.invokeModel(
        modelWithTools,
        languageModelConnectionNodeId,
        conversation,
        ctx,
        itemInputsByPort,
        guardrails.modelInvocationOptions,
      );
      finalResponse = response;

      const toolCalls = AgentMessageFactory.extractToolCalls(response);
      if (toolCalls.length === 0) {
        break;
      }

      if (this.cannotExecuteAnotherToolRound(turn, guardrails)) {
        this.finishOrThrowWhenTurnCapHitWithToolCalls(ctx, guardrails);
        break;
      }

      const plannedToolCalls = this.planToolCalls(itemScopedTools, toolCalls, ctx.nodeId);
      toolCallCount += plannedToolCalls.length;
      await this.markQueuedTools(plannedToolCalls, ctx);
      const executedToolCalls = await this.toolExecutionCoordinator.execute({
        plannedToolCalls,
        ctx,
        agentName: this.getAgentDisplayName(ctx),
        repairAttemptsByToolName,
      });
      this.appendAssistantAndToolMessages(conversation, response, executedToolCalls);
    }

    if (!finalResponse) {
      throw new Error(`AIAgent "${ctx.config.name ?? ctx.nodeId}" did not produce a model response.`);
    }
    return {
      finalResponse,
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
    conversation: BaseMessage[],
    assistantMessage: AIMessage,
    executedToolCalls: ReadonlyArray<ExecutedToolCall>,
  ): void {
    conversation.push(
      assistantMessage,
      ...executedToolCalls.map((toolCall) =>
        AgentMessageFactory.createToolMessage(toolCall.toolCallId, toolCall.serialized),
      ),
    );
  }

  private async resolveFinalOutputJson(
    prepared: PreparedAgentExecution,
    itemInputsByPort: NodeInputsByPort,
    conversation: ReadonlyArray<BaseMessage>,
    finalResponse: AIMessage,
    wasToolEnabledRun: boolean,
  ): Promise<unknown> {
    if (!prepared.ctx.config.outputSchema) {
      return AgentOutputFactory.fromAgentContent(AgentMessageFactory.extractContent(finalResponse));
    }
    return await this.structuredOutputRunner.resolve({
      model: prepared.model,
      chatModelConfig: prepared.ctx.config.chatModel,
      schema: prepared.ctx.config.outputSchema,
      conversation: wasToolEnabledRun ? [...conversation, finalResponse] : conversation,
      rawFinalResponse: finalResponse,
      agentName: this.getAgentDisplayName(prepared.ctx),
      nodeId: prepared.ctx.nodeId,
      invokeTextModel: async (messages) =>
        await this.invokeModel(
          prepared.model,
          prepared.languageModelConnectionNodeId,
          messages,
          prepared.ctx,
          itemInputsByPort,
          prepared.guardrails.modelInvocationOptions,
        ),
      invokeStructuredModel: async (structuredModel, messages) =>
        await this.invokeStructuredModel(
          structuredModel,
          prepared.languageModelConnectionNodeId,
          messages,
          prepared.ctx,
          itemInputsByPort,
          prepared.guardrails.modelInvocationOptions,
        ),
    });
  }

  private buildOutputItem(item: Item, outputJson: unknown): Item {
    return AgentOutputFactory.replaceJson(item, outputJson);
  }

  private bindToolsToModel(
    model: LangChainChatModelLike,
    itemScopedTools: ReadonlyArray<ItemScopedToolBinding>,
  ): LangChainChatModelLike {
    if (itemScopedTools.length === 0 || !model.bindTools) {
      return model;
    }
    return model.bindTools(itemScopedTools.map((entry) => entry.langChainTool));
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
      const langChainTool = this.executionHelpers.createDynamicStructuredTool(
        entry,
        toolCredentialContext,
        item,
        itemIndex,
        items,
      );

      return { config: entry.config, langChainTool };
    });
  }

  private async invokeModel(
    model: LangChainChatModelLike,
    nodeId: string,
    messages: ReadonlyArray<BaseMessage>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    inputsByPort: NodeInputsByPort,
    options?: AgentGuardrailConfig["modelInvocationOptions"],
  ): Promise<AIMessage> {
    const invocationId = ConnectionInvocationIdFactory.create();
    const startedAt = new Date();
    const summarizedInput = this.summarizeLlmMessages(messages);
    const span = this.createModelInvocationSpan(ctx, invocationId, startedAt);
    await ctx.nodeState?.markQueued({ nodeId, activationId: ctx.activationId, inputsByPort });
    await ctx.nodeState?.markRunning({ nodeId, activationId: ctx.activationId, inputsByPort });
    try {
      const response = (await model.invoke(messages, options)) as AIMessage;
      const finishedAt = new Date();
      await ctx.nodeState?.markCompleted({
        nodeId,
        activationId: ctx.activationId,
        inputsByPort,
        outputs: AgentOutputFactory.fromUnknown({
          content: AgentMessageFactory.extractContent(response),
        }),
      });
      const content = AgentMessageFactory.extractContent(response);
      await span.attachArtifact({
        kind: "ai.messages",
        contentType: "application/json",
        previewJson: summarizedInput,
      });
      await span.attachArtifact({
        kind: "ai.response",
        contentType: "application/json",
        previewJson: content,
      });
      await this.recordModelUsageMetrics(span, response, ctx);
      await span.end({ status: "ok", endedAt: finishedAt });
      await ctx.nodeState?.appendConnectionInvocation({
        invocationId,
        connectionNodeId: nodeId,
        parentAgentNodeId: ctx.nodeId,
        parentAgentActivationId: ctx.activationId,
        status: "completed",
        managedInput: summarizedInput,
        managedOutput: content,
        queuedAt: startedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      });
      return response;
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
        nodeId,
        ctx,
        inputsByPort,
        managedInput: this.summarizeLlmMessages(messages),
      });
    }
  }

  private async invokeStructuredModel(
    model: LangChainStructuredOutputModelLike,
    nodeId: string,
    messages: ReadonlyArray<BaseMessage>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    inputsByPort: NodeInputsByPort,
    options?: AgentGuardrailConfig["modelInvocationOptions"],
  ): Promise<unknown> {
    const invocationId = ConnectionInvocationIdFactory.create();
    const startedAt = new Date();
    const summarizedInput = this.summarizeLlmMessages(messages);
    const span = this.createModelInvocationSpan(ctx, invocationId, startedAt);
    await ctx.nodeState?.markQueued({ nodeId, activationId: ctx.activationId, inputsByPort });
    await ctx.nodeState?.markRunning({ nodeId, activationId: ctx.activationId, inputsByPort });
    try {
      const response = await model.invoke(messages, options);
      const finishedAt = new Date();
      await ctx.nodeState?.markCompleted({
        nodeId,
        activationId: ctx.activationId,
        inputsByPort,
        outputs: AgentOutputFactory.fromUnknown(response),
      });
      await span.attachArtifact({
        kind: "ai.messages",
        contentType: "application/json",
        previewJson: summarizedInput,
      });
      await span.attachArtifact({
        kind: "ai.response.structured",
        contentType: "application/json",
        previewJson: this.resultToJsonValue(response),
      });
      await this.recordModelUsageMetrics(span, response, ctx);
      await span.end({ status: "ok", endedAt: finishedAt });
      await ctx.nodeState?.appendConnectionInvocation({
        invocationId,
        connectionNodeId: nodeId,
        parentAgentNodeId: ctx.nodeId,
        parentAgentActivationId: ctx.activationId,
        status: "completed",
        managedInput: summarizedInput,
        managedOutput: this.resultToJsonValue(response),
        queuedAt: startedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      });
      return response;
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
        nodeId,
        ctx,
        inputsByPort,
        managedInput: this.summarizeLlmMessages(messages),
      });
    }
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
      },
    });
  }

  private async recordModelUsageMetrics(
    span: ReturnType<NodeExecutionContext["telemetry"]["startChildSpan"]>,
    response: unknown,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
  ) {
    const usage = this.extractModelUsageMetrics(response);
    for (const [name, value] of Object.entries(usage)) {
      if (value === undefined) {
        continue;
      }
      await span.recordMetric({ name, value });
    }
    await this.captureCostTrackingUsage(span, ctx, usage);
  }

  private async captureCostTrackingUsage(
    span: ReturnType<NodeExecutionContext["telemetry"]["startChildSpan"]>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    usage: Readonly<Record<string, number | undefined>>,
  ): Promise<void> {
    const costTracking = span.costTracking;
    if (!costTracking) {
      return;
    }
    const provider = ctx.config.chatModel.provider;
    const pricingKey = ctx.config.chatModel.modelName;
    if (!provider || !pricingKey) {
      return;
    }
    const inputTokens = usage[GenAiTelemetryAttributeNames.usageInputTokens];
    const outputTokens = usage[GenAiTelemetryAttributeNames.usageOutputTokens];
    if (inputTokens !== undefined) {
      await costTracking.captureUsage({
        component: "chat",
        provider,
        operation: "completion.input",
        pricingKey,
        usageUnit: "input_tokens",
        quantity: inputTokens,
        modelName: pricingKey,
      });
    }
    if (outputTokens !== undefined) {
      await costTracking.captureUsage({
        component: "chat",
        provider,
        operation: "completion.output",
        pricingKey,
        usageUnit: "output_tokens",
        quantity: outputTokens,
        modelName: pricingKey,
      });
    }
  }

  private resolveChatModelName(chatModel: ChatModelConfig): string {
    return chatModel.modelName ?? chatModel.name;
  }

  private extractModelUsageMetrics(response: unknown): Readonly<Record<string, number | undefined>> {
    const usage = this.extractUsageObject(response);
    const inputTokens = this.readUsageNumber(usage, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"]);
    const outputTokens = this.readUsageNumber(usage, [
      "output_tokens",
      "outputTokens",
      "completion_tokens",
      "completionTokens",
    ]);
    const totalTokens =
      this.readUsageNumber(usage, ["total_tokens", "totalTokens"]) ??
      (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined);
    const cachedInputTokens = this.readUsageNumber(usage, [
      "cache_read_input_tokens",
      "cacheReadInputTokens",
      "input_token_details.cached_tokens",
    ]);
    const reasoningTokens = this.readUsageNumber(usage, [
      "reasoning_tokens",
      "reasoningTokens",
      "output_token_details.reasoning_tokens",
    ]);
    return {
      [GenAiTelemetryAttributeNames.usageInputTokens]: inputTokens,
      [GenAiTelemetryAttributeNames.usageOutputTokens]: outputTokens,
      [GenAiTelemetryAttributeNames.usageTotalTokens]: totalTokens,
      [GenAiTelemetryAttributeNames.usageCacheReadInputTokens]: cachedInputTokens,
      [GenAiTelemetryAttributeNames.usageReasoningTokens]: reasoningTokens,
    };
  }

  private extractUsageObject(response: unknown): Readonly<Record<string, unknown>> | undefined {
    if (!this.isRecord(response)) {
      return undefined;
    }
    const usageMetadata = response["usage_metadata"];
    if (this.isRecord(usageMetadata)) {
      return usageMetadata;
    }
    const responseMetadata = response["response_metadata"];
    if (this.isRecord(responseMetadata)) {
      const tokenUsage = responseMetadata["tokenUsage"];
      if (this.isRecord(tokenUsage)) {
        return tokenUsage;
      }
      const usage = responseMetadata["usage"];
      if (this.isRecord(usage)) {
        return usage;
      }
    }
    return undefined;
  }

  private readUsageNumber(
    source: Readonly<Record<string, unknown>> | undefined,
    keys: ReadonlyArray<string>,
  ): number | undefined {
    for (const key of keys) {
      const value = this.readNestedUsageValue(source, key);
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  }

  private readNestedUsageValue(source: Readonly<Record<string, unknown>> | undefined, dottedKey: string): unknown {
    if (!source) {
      return undefined;
    }
    let current: unknown = source;
    for (const segment of dottedKey.split(".")) {
      if (!this.isRecord(current)) {
        return undefined;
      }
      current = current[segment];
    }
    return current;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private async markQueuedTools(
    plannedToolCalls: ReadonlyArray<PlannedToolCall>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
  ): Promise<void> {
    for (const plannedToolCall of plannedToolCalls) {
      await ctx.nodeState?.markQueued({
        nodeId: plannedToolCall.nodeId,
        activationId: ctx.activationId,
        inputsByPort: AgentToolCallPortMap.fromInput(plannedToolCall.toolCall.input ?? {}),
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
    });
    return effectiveError;
  }

  private summarizeLlmMessages(messages: ReadonlyArray<BaseMessage>): JsonValue {
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
    if (value === undefined) {
      return undefined;
    }
    const json = JSON.stringify(value);
    return JSON.parse(json) as JsonValue;
  }

  private createPromptMessages(
    item: Item,
    itemIndex: number,
    items: Items,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
  ): ReadonlyArray<BaseMessage> {
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
          `AIAgent tool "${config.name}": node-backed tool is missing inputSchema (cannot build LangChain tool).`,
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
          `AIAgent tool "${config.name}": callable tool is missing inputSchema (cannot build LangChain tool).`,
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

  /**
   * Consumer apps can resolve two copies of `@codemation/core`, breaking `instanceof NodeBackedToolConfig` and
   * sending node-backed tools down the plugin-tool branch with `inputSchema: undefined` (LangChain then crashes in
   * json-schema validation). {@link NodeBackedToolConfig#toolKind} is stable across copies.
   */
  private isNodeBackedToolConfig(config: ToolConfig): config is NodeBackedToolConfig<any, any, any> {
    return (
      config instanceof NodeBackedToolConfig ||
      (typeof config === "object" && config !== null && (config as { toolKind?: unknown }).toolKind === "nodeBacked")
    );
  }

  /**
   * Callable tools use {@link CallableToolConfig#toolKind} for cross-package / JSON round-trip safety.
   */
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

import type {
  AgentGuardrailConfig,
  AgentToolCall,
  ChatModelConfig,
  ChatModelFactory,
  Item,
  Items,
  JsonValue,
  LangChainChatModelLike,
  Node,
  NodeExecutionContext,
  NodeInputsByPort,
  NodeOutputs,
  Tool,
  ToolConfig,
  ZodSchemaAny,
} from "@codemation/core";

import type { CredentialSessionService } from "@codemation/core";
import {
  AgentGuardrailDefaults,
  AgentMessageConfigNormalizer,
  ConnectionInvocationIdFactory,
  ConnectionNodeIdFactory,
  CoreTokens,
  NodeBackedToolConfig,
  inject,
  node,
  type NodeResolver,
} from "@codemation/core";

import { AIMessage, type BaseMessage } from "@langchain/core/messages";

import type { AIAgent } from "./AIAgentConfig";
import { AIAgentExecutionHelpersFactory } from "./AIAgentExecutionHelpersFactory";
import { ConnectionCredentialExecutionContextFactory } from "./ConnectionCredentialExecutionContextFactory";
import { AgentMessageFactory } from "./AgentMessageFactory";
import { AgentOutputFactory } from "./AgentOutputFactory";
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

/** Everything needed to run the agent loop for a workflow execution (one `execute` call). */
interface PreparedAgentExecution {
  readonly ctx: NodeExecutionContext<AIAgent<any, any>>;
  readonly model: LangChainChatModelLike;
  readonly resolvedTools: ReadonlyArray<ResolvedTool>;
  readonly guardrails: ResolvedGuardrails;
  readonly languageModelConnectionNodeId: string;
}

@node({ packageName: "@codemation/core-nodes" })
export class AIAgentNode implements Node<AIAgent<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  private readonly connectionCredentialExecutionContextFactory: ConnectionCredentialExecutionContextFactory;

  constructor(
    @inject(CoreTokens.NodeResolver)
    private readonly nodeResolver: NodeResolver,
    @inject(CoreTokens.CredentialSessionService)
    credentialSessions: CredentialSessionService,
    @inject(NodeBackedToolRuntime)
    private readonly nodeBackedToolRuntime: NodeBackedToolRuntime,
    @inject(AIAgentExecutionHelpersFactory)
    private readonly executionHelpers: AIAgentExecutionHelpersFactory,
  ) {
    this.connectionCredentialExecutionContextFactory =
      this.executionHelpers.createConnectionCredentialExecutionContextFactory(credentialSessions);
  }

  async execute(items: Items, ctx: NodeExecutionContext<AIAgent<any, any>>): Promise<NodeOutputs> {
    const prepared = await this.prepareExecution(ctx);
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      out.push(await this.runAgentForItem(prepared, items[i]!, i, items));
    }
    return { main: out };
  }

  /**
   * Resolves the chat model and tools once, then returns shared state for every item in the batch.
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
    const modelWithTools = this.bindToolsToModel(prepared.model, itemScopedTools);
    const finalResponse = await this.runTurnLoopUntilFinalAnswer({
      prepared,
      itemInputsByPort,
      itemScopedTools,
      conversation,
      modelWithTools,
    });
    return this.buildOutputItem(item, finalResponse);
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
  }): Promise<AIMessage> {
    const { prepared, itemInputsByPort, itemScopedTools, conversation, modelWithTools } = args;
    const { ctx, guardrails, languageModelConnectionNodeId } = prepared;

    let finalResponse: AIMessage | undefined;

    for (let turn = 1; turn <= guardrails.maxTurns; turn++) {
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
      await this.markQueuedTools(plannedToolCalls, ctx);
      const executedToolCalls = await this.executeToolCalls(plannedToolCalls, ctx);
      this.appendAssistantAndToolMessages(conversation, response, executedToolCalls);
    }

    if (!finalResponse) {
      throw new Error(`AIAgent "${ctx.config.name ?? ctx.nodeId}" did not produce a model response.`);
    }
    return finalResponse;
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

  private buildOutputItem(item: Item, finalResponse: AIMessage): Item {
    return AgentOutputFactory.replaceJson(
      item,
      AgentOutputFactory.fromAgentContent(AgentMessageFactory.extractContent(finalResponse)),
    );
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
    await ctx.nodeState?.markQueued({ nodeId, activationId: ctx.activationId, inputsByPort });
    await ctx.nodeState?.markRunning({ nodeId, activationId: ctx.activationId, inputsByPort });
    try {
      const response = (await model.invoke(messages, options)) as AIMessage;
      await ctx.nodeState?.markCompleted({
        nodeId,
        activationId: ctx.activationId,
        inputsByPort,
        outputs: AgentOutputFactory.fromUnknown({
          content: AgentMessageFactory.extractContent(response),
        }),
      });
      const content = AgentMessageFactory.extractContent(response);
      await ctx.nodeState?.appendConnectionInvocation({
        invocationId: ConnectionInvocationIdFactory.create(),
        connectionNodeId: nodeId,
        parentAgentNodeId: ctx.nodeId,
        parentAgentActivationId: ctx.activationId,
        status: "completed",
        managedInput: this.summarizeLlmMessages(messages),
        managedOutput: content,
        finishedAt: new Date().toISOString(),
      });
      return response;
    } catch (error) {
      throw await this.failTrackedNodeInvocation(error, nodeId, ctx, inputsByPort, this.summarizeLlmMessages(messages));
    }
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

  private async executeToolCalls(
    plannedToolCalls: ReadonlyArray<PlannedToolCall>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
  ): Promise<ReadonlyArray<ExecutedToolCall>> {
    const results = await Promise.allSettled(
      plannedToolCalls.map(async (plannedToolCall) => {
        const toolCallInputsByPort = AgentToolCallPortMap.fromInput(plannedToolCall.toolCall.input ?? {});
        await ctx.nodeState?.markRunning({
          nodeId: plannedToolCall.nodeId,
          activationId: ctx.activationId,
          inputsByPort: toolCallInputsByPort,
        });
        try {
          const serialized = await plannedToolCall.binding.langChainTool.invoke(plannedToolCall.toolCall.input ?? {});
          const result = this.parseToolOutput(serialized);
          await ctx.nodeState?.markCompleted({
            nodeId: plannedToolCall.nodeId,
            activationId: ctx.activationId,
            inputsByPort: toolCallInputsByPort,
            outputs: AgentOutputFactory.fromUnknown(result),
          });
          await ctx.nodeState?.appendConnectionInvocation({
            invocationId: ConnectionInvocationIdFactory.create(),
            connectionNodeId: plannedToolCall.nodeId,
            parentAgentNodeId: ctx.nodeId,
            parentAgentActivationId: ctx.activationId,
            status: "completed",
            managedInput: this.toolCallInputToJson(plannedToolCall.toolCall.input),
            managedOutput: this.resultToJsonValue(result),
            finishedAt: new Date().toISOString(),
          });
          return {
            toolName: plannedToolCall.binding.config.name,
            toolCallId: plannedToolCall.toolCall.id ?? plannedToolCall.binding.config.name,
            serialized,
            result,
          } satisfies ExecutedToolCall;
        } catch (error) {
          throw await this.failTrackedNodeInvocation(
            error,
            plannedToolCall.nodeId,
            ctx,
            toolCallInputsByPort,
            this.toolCallInputToJson(plannedToolCall.toolCall.input),
          );
        }
      }),
    );

    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") {
      throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
    }

    return results
      .filter((result): result is PromiseFulfilledResult<ExecutedToolCall> => result.status === "fulfilled")
      .map((result) => result.value);
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

  private parseToolOutput(serialized: unknown): unknown {
    if (typeof serialized !== "string") return serialized;
    try {
      return JSON.parse(serialized);
    } catch {
      return serialized;
    }
  }

  private async failTrackedNodeInvocation(
    error: unknown,
    nodeId: string,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    inputsByPort: NodeInputsByPort,
    managedInput?: JsonValue,
  ): Promise<Error> {
    const effectiveError = error instanceof Error ? error : new Error(String(error));
    await ctx.nodeState?.markFailed({
      nodeId,
      activationId: ctx.activationId,
      inputsByPort,
      error: effectiveError,
    });
    await ctx.nodeState?.appendConnectionInvocation({
      invocationId: ConnectionInvocationIdFactory.create(),
      connectionNodeId: nodeId,
      parentAgentNodeId: ctx.nodeId,
      parentAgentActivationId: ctx.activationId,
      status: "failed",
      managedInput,
      error: {
        message: effectiveError.message,
        name: effectiveError.name,
        stack: effectiveError.stack,
      },
      finishedAt: new Date().toISOString(),
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

  private toolCallInputToJson(input: unknown): JsonValue | undefined {
    return this.resultToJsonValue(input);
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
      AgentMessageConfigNormalizer.normalize(ctx.config, {
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
}

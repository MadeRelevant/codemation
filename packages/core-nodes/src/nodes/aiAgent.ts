import type {
  AgentNodeConfig,
  AgentToolCall,
  ChatModelConfig,
  ChatModelFactory,
  Item,
  Items,
  LangChainChatModelLike,
  Node,
  NodeExecutionContext,
  NodeInputsByPort,
  NodeOutputs,
  RunnableNodeConfig,
  Tool,
  ToolConfig,
  TypeToken,
  ZodSchemaAny,
} from "@codemation/core";
import { AgentAttachmentNodeIdFactory } from "@codemation/core";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";

class AgentItemPortMap {
  static fromItem(item: Item): NodeInputsByPort {
    return { in: [item] };
  }
}

class AgentOutputFactory {
  static fromUnknown(value: unknown): NodeOutputs {
    return { main: [{ json: value }] };
  }

  static extendItem(item: Item, value: unknown): Item {
    const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
    const toolResults = this.extractToolResults(value);
    const primaryClassification = toolResults.length === 1 && this.isRecord(toolResults[0])
      ? toolResults[0]
      : toolResults.find((candidate) => this.isRecord(candidate) && typeof candidate.isRfq === "boolean");

    return {
      ...item,
      json: {
        ...base,
        agentResult: value,
        classification: primaryClassification,
      },
    };
  }

  private static extractToolResults(value: unknown): ReadonlyArray<unknown> {
    if (!this.isRecord(value)) return [];
    const toolResults = value.toolResults;
    return Array.isArray(toolResults) ? toolResults : [];
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

class AgentMessageFactory {
  static createSystemPrompt(systemMessage: string): SystemMessage {
    return new SystemMessage(systemMessage);
  }

  static createUserPrompt(prompt: string): HumanMessage {
    return new HumanMessage(prompt);
  }

  static createToolMessage(toolCallId: string, content: string): ToolMessage {
    return new ToolMessage({ tool_call_id: toolCallId, content });
  }

  static extractContent(message: unknown): string {
    if (typeof message === "string") return message;
    if (!this.isRecord(message)) return String(message);
    const content = message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (this.isRecord(part) && typeof part.text === "string") return part.text;
          return JSON.stringify(part);
        })
        .join("\n");
    }
    return JSON.stringify(content);
  }

  static extractToolCalls(message: unknown): ReadonlyArray<AgentToolCall> {
    if (!this.isRecord(message)) return [];
    const toolCalls = message.tool_calls;
    if (!Array.isArray(toolCalls)) return [];
    return toolCalls
      .filter((toolCall) => this.isRecord(toolCall) && typeof toolCall.name === "string")
      .map((toolCall) => ({
        id: typeof toolCall.id === "string" ? toolCall.id : undefined,
        name: toolCall.name as string,
        input: this.isRecord(toolCall) && "args" in toolCall ? toolCall.args : undefined,
      }));
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

type ResolvedTool = Readonly<{
  config: ToolConfig;
  tool: Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>;
}>;

type ItemScopedToolBinding = Readonly<{
  config: ToolConfig;
  nodeId: string;
  langChainTool: DynamicStructuredTool;
}>;

type ExecutedToolCall = Readonly<{
  toolName: string;
  toolCallId: string;
  result: unknown;
  serialized: string;
}>;

export class AIAgent<TInputJson = unknown, TOutputJson = unknown>
  implements RunnableNodeConfig<TInputJson, TOutputJson>, AgentNodeConfig<TInputJson, TOutputJson>
{
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = AIAgentNode;
  readonly tokenId = "codemation.core-nodes.ai-agent";
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string,
    public readonly systemMessage: string,
    public readonly userMessageFormatter: (
      item: Item<TInputJson>,
      index: number,
      items: Items<TInputJson>,
      ctx: NodeExecutionContext<AIAgent<TInputJson, TOutputJson>>,
    ) => string,
    public readonly chatModel: ChatModelConfig,
    public readonly tools: ReadonlyArray<ToolConfig> = [],
    public readonly id?: string,
  ) {}
}

export class AIAgentNode implements Node<AIAgent<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<AIAgent<any, any>>): Promise<NodeOutputs> {
    const container = ctx.services.container;
    if (!container) throw new Error(`AIAgent requires ctx.services.container to resolve chat models and tools`);

    const chatModelFactory = container.resolve(ctx.config.chatModel.token) as ChatModelFactory<ChatModelConfig>;
    const model = await Promise.resolve(chatModelFactory.create({ config: ctx.config.chatModel, ctx }));
    const resolvedTools = this.resolveTools(ctx.config.tools ?? [], container);

    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const prompt = ctx.config.userMessageFormatter(item, i, items, ctx);
      const itemInputsByPort = AgentItemPortMap.fromItem(item);
      const itemScopedTools = this.createItemScopedTools(resolvedTools, ctx, item, i, items);
      const firstResponse = await this.invokeModel(
        itemScopedTools.length > 0 && model.bindTools ? model.bindTools(itemScopedTools.map((entry) => entry.langChainTool)) : model,
        AgentAttachmentNodeIdFactory.createLanguageModelNodeId(ctx.nodeId),
        [AgentMessageFactory.createSystemPrompt(ctx.config.systemMessage), AgentMessageFactory.createUserPrompt(prompt)],
        ctx,
        itemInputsByPort,
      );

      const toolCalls = AgentMessageFactory.extractToolCalls(firstResponse);
      if (toolCalls.length === 0) {
        out.push(AgentOutputFactory.extendItem(item, { content: AgentMessageFactory.extractContent(firstResponse), toolResults: [] }));
        continue;
      }

      await this.markQueuedTools(itemScopedTools, toolCalls, ctx, itemInputsByPort);
      const executedToolCalls = await this.executeToolCalls(itemScopedTools, toolCalls);
      const finalResponse = await this.invokeModel(
        itemScopedTools.length > 0 && model.bindTools ? model.bindTools(itemScopedTools.map((entry) => entry.langChainTool)) : model,
        AgentAttachmentNodeIdFactory.createLanguageModelNodeId(ctx.nodeId),
        [
          AgentMessageFactory.createSystemPrompt(ctx.config.systemMessage),
          AgentMessageFactory.createUserPrompt(prompt),
          firstResponse,
          ...executedToolCalls.map((toolCall) => AgentMessageFactory.createToolMessage(toolCall.toolCallId, toolCall.serialized)),
        ],
        ctx,
        itemInputsByPort,
      );

      out.push(
        AgentOutputFactory.extendItem(item, {
          content: AgentMessageFactory.extractContent(finalResponse),
          toolResults: executedToolCalls.map((toolCall) => toolCall.result),
        }),
      );
    }

    return { main: out };
  }

  private resolveTools(
    toolConfigs: ReadonlyArray<ToolConfig>,
    container: NonNullable<NodeExecutionContext<AIAgent<any, any>>["services"]["container"]>,
  ): ReadonlyArray<ResolvedTool> {
    const resolvedTools = toolConfigs.map((config) => ({
      config,
      tool: container.resolve(config.token) as Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>,
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
      const nodeId = AgentAttachmentNodeIdFactory.createToolNodeId(ctx.nodeId, entry.config.name);
      const langChainTool = new DynamicStructuredTool({
        name: entry.config.name,
        description: entry.config.description ?? entry.tool.defaultDescription,
        schema: entry.tool.inputSchema,
        func: async (input) => {
          const inputsByPort = AgentItemPortMap.fromItem(item);
          await ctx.services.nodeState?.markRunning({ nodeId, activationId: ctx.activationId, inputsByPort });
          try {
            const result = await entry.tool.execute({
              config: entry.config,
              input,
              ctx,
              item,
              itemIndex,
              items,
            });
            await ctx.services.nodeState?.markCompleted({
              nodeId,
              activationId: ctx.activationId,
              inputsByPort,
              outputs: AgentOutputFactory.fromUnknown(result),
            });
            return JSON.stringify(result);
          } catch (error) {
            throw await this.failTrackedNodeInvocation(error, nodeId, ctx, inputsByPort);
          }
        },
      });

      return { config: entry.config, nodeId, langChainTool };
    });
  }

  private async invokeModel(
    model: LangChainChatModelLike,
    nodeId: string,
    messages: ReadonlyArray<BaseMessage>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    inputsByPort: NodeInputsByPort,
  ): Promise<AIMessage> {
    await ctx.services.nodeState?.markQueued({ nodeId, activationId: ctx.activationId, inputsByPort });
    await ctx.services.nodeState?.markRunning({ nodeId, activationId: ctx.activationId, inputsByPort });
    try {
      const response = (await model.invoke(messages)) as AIMessage;
      await ctx.services.nodeState?.markCompleted({
        nodeId,
        activationId: ctx.activationId,
        inputsByPort,
        outputs: AgentOutputFactory.fromUnknown({
          content: AgentMessageFactory.extractContent(response),
          toolCalls: AgentMessageFactory.extractToolCalls(response),
        }),
      });
      return response;
    } catch (error) {
      throw await this.failTrackedNodeInvocation(error, nodeId, ctx, inputsByPort);
    }
  }

  private async markQueuedTools(
    bindings: ReadonlyArray<ItemScopedToolBinding>,
    toolCalls: ReadonlyArray<AgentToolCall>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    inputsByPort: NodeInputsByPort,
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      const binding = bindings.find((entry) => entry.config.name === toolCall.name);
      if (!binding) throw new Error(`Unknown tool requested by model: ${toolCall.name}`);
      await ctx.services.nodeState?.markQueued({ nodeId: binding.nodeId, activationId: ctx.activationId, inputsByPort });
    }
  }

  private async executeToolCalls(
    bindings: ReadonlyArray<ItemScopedToolBinding>,
    toolCalls: ReadonlyArray<AgentToolCall>,
  ): Promise<ReadonlyArray<ExecutedToolCall>> {
    const results = await Promise.allSettled(
      toolCalls.map(async (toolCall) => {
        const binding = bindings.find((entry) => entry.config.name === toolCall.name);
        if (!binding) throw new Error(`Unknown tool requested by model: ${toolCall.name}`);
        const serialized = await binding.langChainTool.invoke(toolCall.input ?? {});
        return {
          toolName: binding.config.name,
          toolCallId: toolCall.id ?? binding.config.name,
          serialized,
          result: this.parseToolOutput(serialized),
        } satisfies ExecutedToolCall;
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
  ): Promise<Error> {
    const effectiveError = error instanceof Error ? error : new Error(String(error));
    await ctx.services.nodeState?.markFailed({
      nodeId,
      activationId: ctx.activationId,
      inputsByPort,
      error: effectiveError,
    });
    return effectiveError;
  }
}


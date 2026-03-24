import type {
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
ZodSchemaAny
} from "@codemation/core";

import type { CredentialSessionService } from "@codemation/core";
import { ConnectionInvocationIdFactory, ConnectionNodeIdFactory, CoreTokens, inject, node, type NodeResolver } from "@codemation/core";

import { AIMessage,type BaseMessage } from "@langchain/core/messages";

import { DynamicStructuredTool } from "@langchain/core/tools";

import type { AIAgent } from "./AIAgentConfig";
import { ConnectionCredentialExecutionContextFactory } from "./ConnectionCredentialExecutionContextFactory";
import { AgentMessageFactory } from "./AgentMessageFactory";
import { AgentOutputFactory } from "./AgentOutputFactory";
import { AgentToolCallPortMap } from "./AgentToolCallPortMapFactory";
import {
AgentItemPortMap,
type ExecutedToolCall,
type ItemScopedToolBinding,
type PlannedToolCall,
type ResolvedTool,
} from "./aiAgentSupport.types";

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
  ) {
    this.connectionCredentialExecutionContextFactory = new ConnectionCredentialExecutionContextFactory(credentialSessions);
  }

  async execute(items: Items, ctx: NodeExecutionContext<AIAgent<any, any>>): Promise<NodeOutputs> {
    const chatModelFactory = this.nodeResolver.resolve(ctx.config.chatModel.type) as ChatModelFactory<ChatModelConfig>;
    const languageModelCredentialContext = this.connectionCredentialExecutionContextFactory.forConnectionNode(ctx, {
      connectionNodeId: ConnectionNodeIdFactory.languageModelConnectionNodeId(ctx.nodeId),
      getCredentialRequirements: () => ctx.config.chatModel.getCredentialRequirements?.() ?? [],
    });
    const model = await Promise.resolve(chatModelFactory.create({ config: ctx.config.chatModel, ctx: languageModelCredentialContext }));
    const resolvedTools = this.resolveTools(ctx.config.tools ?? []);

    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const prompt = ctx.config.userMessageFormatter(item, i, items, ctx);
      const itemInputsByPort = AgentItemPortMap.fromItem(item);
      const itemScopedTools = this.createItemScopedTools(resolvedTools, ctx, item, i, items);
      const firstResponse = await this.invokeModel(
        itemScopedTools.length > 0 && model.bindTools ? model.bindTools(itemScopedTools.map((entry) => entry.langChainTool)) : model,
        ConnectionNodeIdFactory.languageModelConnectionNodeId(ctx.nodeId),
        [AgentMessageFactory.createSystemPrompt(ctx.config.systemMessage), AgentMessageFactory.createUserPrompt(prompt)],
        ctx,
        itemInputsByPort,
      );

      const toolCalls = AgentMessageFactory.extractToolCalls(firstResponse);
      if (toolCalls.length === 0) {
        out.push(
          AgentOutputFactory.replaceJson(
            item,
            AgentOutputFactory.fromAgentContent(AgentMessageFactory.extractContent(firstResponse)),
          ),
        );
        continue;
      }

      const plannedToolCalls = this.planToolCalls(itemScopedTools, toolCalls, ctx.nodeId);
      await this.markQueuedTools(plannedToolCalls, ctx);
      const executedToolCalls = await this.executeToolCalls(plannedToolCalls, ctx);
      const finalResponse = await this.invokeModel(
        itemScopedTools.length > 0 && model.bindTools ? model.bindTools(itemScopedTools.map((entry) => entry.langChainTool)) : model,
        ConnectionNodeIdFactory.languageModelConnectionNodeId(ctx.nodeId),
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
        AgentOutputFactory.replaceJson(
          item,
          AgentOutputFactory.fromAgentContent(AgentMessageFactory.extractContent(finalResponse)),
        ),
      );
    }

    return { main: out };
  }

  private resolveTools(
    toolConfigs: ReadonlyArray<ToolConfig>,
  ): ReadonlyArray<ResolvedTool> {
    const resolvedTools = toolConfigs.map((config) => ({
      config,
      tool: this.nodeResolver.resolve(config.type) as Tool<ToolConfig, ZodSchemaAny, ZodSchemaAny>,
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
      const langChainTool = new DynamicStructuredTool({
        name: entry.config.name,
        description: entry.config.description ?? entry.tool.defaultDescription,
        schema: entry.tool.inputSchema,
        func: async (input) => {
          const result = await entry.tool.execute({
            config: entry.config,
            input,
            ctx: toolCredentialContext,
            item,
            itemIndex,
            items,
          });
          return JSON.stringify(result);
        },
      });

      return { config: entry.config, langChainTool };
    });
  }

  private async invokeModel(
    model: LangChainChatModelLike,
    nodeId: string,
    messages: ReadonlyArray<BaseMessage>,
    ctx: NodeExecutionContext<AIAgent<any, any>>,
    inputsByPort: NodeInputsByPort,
  ): Promise<AIMessage> {
    await ctx.nodeState?.markQueued({ nodeId, activationId: ctx.activationId, inputsByPort });
    await ctx.nodeState?.markRunning({ nodeId, activationId: ctx.activationId, inputsByPort });
    try {
      const response = (await model.invoke(messages)) as AIMessage;
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
        await ctx.nodeState?.markRunning({ nodeId: plannedToolCall.nodeId, activationId: ctx.activationId, inputsByPort: toolCallInputsByPort });
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
}

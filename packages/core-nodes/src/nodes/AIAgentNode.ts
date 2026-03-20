import type {
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
Tool,
ToolConfig,
ZodSchemaAny
} from "@codemation/core";

import { AgentAttachmentNodeIdFactory,CoreTokens,inject,node,type NodeResolver } from "@codemation/core";

import { AIMessage,type BaseMessage } from "@langchain/core/messages";

import { DynamicStructuredTool } from "@langchain/core/tools";

import type { AIAgent } from "./AIAgentConfig";
import { AgentMessageFactory } from "./AgentMessageFactory";
import { AgentOutputFactory } from "./AgentOutputFactory";
import { AgentToolCallPortMap } from "./AgentToolCallPortMap";
import {
AgentItemPortMap,
type ExecutedToolCall,
type ItemScopedToolBinding,
type PlannedToolCall,
type ResolvedTool,
} from "./aiAgentSupport";

@node({ packageName: "@codemation/core-nodes" })
export class AIAgentNode implements Node<AIAgent<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  constructor(
    @inject(CoreTokens.NodeResolver)
    private readonly nodeResolver: NodeResolver,
  ) {}

  async execute(items: Items, ctx: NodeExecutionContext<AIAgent<any, any>>): Promise<NodeOutputs> {
    const chatModelFactory = this.nodeResolver.resolve(ctx.config.chatModel.type) as ChatModelFactory<ChatModelConfig>;
    const model = await Promise.resolve(chatModelFactory.create({ config: ctx.config.chatModel, ctx }));
    const resolvedTools = this.resolveTools(ctx.config.tools ?? []);

    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const prompt = ctx.config.userMessageFormatter(item, i, items, ctx);
      const itemInputsByPort = AgentItemPortMap.fromItem(item);
      const itemScopedTools = this.createItemScopedTools(resolvedTools, ctx, item, i, items);
      const firstResponse = await this.invokeModel(
        itemScopedTools.length > 0 && model.bindTools ? model.bindTools(itemScopedTools.map((entry) => entry.langChainTool)) : model,
        AgentAttachmentNodeIdFactory.createLanguageModelNodeId(ctx.nodeId, 1),
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
        AgentAttachmentNodeIdFactory.createLanguageModelNodeId(ctx.nodeId, 2),
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
      const langChainTool = new DynamicStructuredTool({
        name: entry.config.name,
        description: entry.config.description ?? entry.tool.defaultDescription,
        schema: entry.tool.inputSchema,
        func: async (input) => {
          const result = await entry.tool.execute({
            config: entry.config,
            input,
            ctx,
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
      return response;
    } catch (error) {
      throw await this.failTrackedNodeInvocation(error, nodeId, ctx, inputsByPort);
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
          return {
            toolName: plannedToolCall.binding.config.name,
            toolCallId: plannedToolCall.toolCall.id ?? plannedToolCall.binding.config.name,
            serialized,
            result,
          } satisfies ExecutedToolCall;
        } catch (error) {
          throw await this.failTrackedNodeInvocation(error, plannedToolCall.nodeId, ctx, toolCallInputsByPort);
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
        nodeId: AgentAttachmentNodeIdFactory.createToolNodeId(parentNodeId, binding.config.name, invocationIndex),
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
  ): Promise<Error> {
    const effectiveError = error instanceof Error ? error : new Error(String(error));
    await ctx.nodeState?.markFailed({
      nodeId,
      activationId: ctx.activationId,
      inputsByPort,
      error: effectiveError,
    });
    return effectiveError;
  }
}

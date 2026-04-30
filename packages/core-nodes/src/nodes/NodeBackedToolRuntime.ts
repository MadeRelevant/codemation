import type {
  MultiInputNode,
  NodeExecutionContext,
  NodeOutputs,
  NodeResolver,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  NodeBackedToolConfig,
  ToolExecuteArgs,
  ZodSchemaAny,
} from "@codemation/core";
import {
  AgentConfigInspector,
  ChildExecutionScopeFactory,
  CoreTokens,
  inject,
  injectable,
  ItemExprResolver,
  NodeOutputNormalizer,
  RunnableOutputBehaviorResolver,
} from "@codemation/core";
import { z } from "zod";

@injectable()
export class NodeBackedToolRuntime {
  constructor(
    @inject(CoreTokens.NodeResolver)
    private readonly nodeResolver: NodeResolver,
    @inject(ItemExprResolver)
    private readonly itemExprResolver: ItemExprResolver,
    @inject(NodeOutputNormalizer)
    private readonly outputNormalizer: NodeOutputNormalizer,
    @inject(RunnableOutputBehaviorResolver)
    private readonly outputBehaviorResolver: RunnableOutputBehaviorResolver,
    @inject(ChildExecutionScopeFactory)
    private readonly childExecutionScopeFactory: ChildExecutionScopeFactory,
  ) {}

  async execute(
    config: NodeBackedToolConfig<any, ZodSchemaAny, ZodSchemaAny>,
    args: ToolExecuteArgs,
  ): Promise<unknown> {
    const nodeInput = config.toNodeItem({
      input: args.input,
      item: args.item,
      itemIndex: args.itemIndex,
      items: args.items,
      ctx: args.ctx,
      node: config.node,
    });
    const nodeCtx = this.resolveNodeCtx(config, args);
    const resolvedNode = this.nodeResolver.resolve(config.node.type);
    const outputs = await this.executeResolvedNode(resolvedNode, nodeInput, nodeCtx);
    return config.toToolOutput({
      input: args.input,
      item: args.item,
      itemIndex: args.itemIndex,
      items: args.items,
      ctx: args.ctx,
      node: config.node,
      outputs,
    });
  }

  /**
   * Returns a re-rooted child ctx for nested-agent tools (so their LLM/tool connection ids derive
   * from the tool connection node, telemetry parents under the tool-call span, and connection
   * invocations carry `parentInvocationId`). Plain runnable tools (non-agent) keep the orchestrator
   * ctx with only `config` swapped — no nesting concern.
   *
   * The caller (`AIAgentNode.createItemScopedTools`) already wraps the orchestrator ctx via
   * `ConnectionCredentialExecutionContextFactory.forConnectionNode`, so `args.ctx.nodeId` is the
   * tool's own connection node id (e.g. `AIAgentNode:2__conn__tool__searchInMail`). We pass that
   * through as the sub-agent's `nodeId`; deriving another `toolConnectionNodeId(args.ctx.nodeId,
   * config.name)` here would prepend a duplicate `__conn__tool__<name>` segment and exponentially
   * deepen ids on each invocation, which also breaks credential resolution because user-provided
   * bindings sit on the single-level connection node id.
   */
  private resolveNodeCtx(
    config: NodeBackedToolConfig<any, ZodSchemaAny, ZodSchemaAny>,
    args: ToolExecuteArgs,
  ): NodeExecutionContext<RunnableNodeConfig> {
    const isNestedAgent = AgentConfigInspector.isAgentNodeConfig(config.node);
    const hooks = args.hooks;
    if (!isNestedAgent || !hooks?.parentSpan || !hooks.parentInvocationId) {
      return {
        ...args.ctx,
        config: config.node,
      } as NodeExecutionContext<RunnableNodeConfig>;
    }
    return this.childExecutionScopeFactory.forSubAgent({
      parentCtx: args.ctx as NodeExecutionContext<RunnableNodeConfig>,
      childNodeId: args.ctx.nodeId,
      childConfig: config.node as unknown as RunnableNodeConfig,
      parentInvocationId: hooks.parentInvocationId,
      parentSpan: hooks.parentSpan,
    });
  }

  private async executeResolvedNode(
    resolvedNode: unknown,
    nodeInput: ToolExecuteArgs["item"],
    ctx: NodeExecutionContext<RunnableNodeConfig>,
  ): Promise<NodeOutputs> {
    if (this.isMultiInputNode(resolvedNode)) {
      return await resolvedNode.executeMulti({ in: [nodeInput] }, ctx);
    }
    if (this.isRunnableNode(resolvedNode)) {
      const runnable = resolvedNode;
      const runnableConfig = ctx.config;
      const behavior = this.outputBehaviorResolver.resolve(runnableConfig);
      const inputSchema = runnable.inputSchema ?? runnableConfig.inputSchema ?? z.unknown();
      const parsed = inputSchema.parse(nodeInput.json);
      const items = [nodeInput];
      const resolvedCtx = await this.itemExprResolver.resolveConfigForItem(ctx, nodeInput, 0, items);
      const execArgs: RunnableNodeExecuteArgs = {
        input: parsed,
        item: nodeInput,
        itemIndex: 0,
        items,
        ctx: resolvedCtx,
      };
      const raw = await Promise.resolve(runnable.execute(execArgs));
      return this.outputNormalizer.normalizeExecuteResult({
        baseItem: nodeInput,
        raw,
        behavior,
      });
    }
    throw new Error(`Node-backed tool expected a runnable node instance for "${ctx.config.name ?? ctx.nodeId}".`);
  }

  private isRunnableNode(value: unknown): value is RunnableNode {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as { kind?: string }).kind === "node" &&
      typeof (value as { execute?: unknown }).execute === "function" &&
      typeof (value as { executeMulti?: unknown }).executeMulti !== "function"
    );
  }

  private isMultiInputNode(value: unknown): value is MultiInputNode<any> {
    return typeof value === "object" && value !== null && "executeMulti" in value;
  }
}

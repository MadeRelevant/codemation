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
import { CoreTokens, inject, injectable, ItemValueResolver, NodeOutputNormalizer } from "@codemation/core";
import { z } from "zod";

@injectable()
export class NodeBackedToolRuntime {
  constructor(
    @inject(CoreTokens.NodeResolver)
    private readonly nodeResolver: NodeResolver,
    @inject(ItemValueResolver)
    private readonly itemValueResolver: ItemValueResolver,
    @inject(NodeOutputNormalizer)
    private readonly outputNormalizer: NodeOutputNormalizer,
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
    const nodeCtx = {
      ...args.ctx,
      config: config.node,
    } as NodeExecutionContext<RunnableNodeConfig>;
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
      const carry = runnableConfig.lineageCarry ?? "emitOnly";
      const inputSchema = runnable.inputSchema ?? runnableConfig.inputSchema ?? z.unknown();
      const parsed = inputSchema.parse(nodeInput.json);
      const items = [nodeInput];
      const resolvedCtx = await this.itemValueResolver.resolveConfigForItem(ctx, nodeInput, 0, items);
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
        carry,
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

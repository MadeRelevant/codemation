import type {
  MultiInputNode,
  Node,
  NodeExecutionContext,
  NodeOutputs,
  NodeResolver,
  NodeBackedToolConfig,
  ToolExecuteArgs,
  ZodSchemaAny,
} from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";

@injectable()
export class NodeBackedToolRuntime {
  constructor(
    @inject(CoreTokens.NodeResolver)
    private readonly nodeResolver: NodeResolver,
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
    } as NodeExecutionContext<any>;
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
    ctx: NodeExecutionContext<any>,
  ): Promise<NodeOutputs> {
    if (this.isMultiInputNode(resolvedNode)) {
      return await resolvedNode.executeMulti({ in: [nodeInput] }, ctx);
    }
    if (this.isNode(resolvedNode)) {
      return await resolvedNode.execute([nodeInput], ctx);
    }
    throw new Error(`Node-backed tool expected a runnable node instance for "${ctx.config.name ?? ctx.nodeId}".`);
  }

  private isNode(value: unknown): value is Node<any> {
    return typeof value === "object" && value !== null && "execute" in value;
  }

  private isMultiInputNode(value: unknown): value is MultiInputNode<any> {
    return typeof value === "object" && value !== null && "executeMulti" in value;
  }
}

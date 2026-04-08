import type {
  Item,
  MultiInputNode,
  Node,
  NodeActivationRequest,
  NodeOutputs,
  WorkflowNodeInstanceFactory,
} from "../types";

import { InProcessRetryRunner } from "./InProcessRetryRunner";

export class NodeExecutor {
  constructor(
    private readonly nodeInstanceFactory: WorkflowNodeInstanceFactory,
    private readonly retryRunner: InProcessRetryRunner,
  ) {}

  async execute(request: NodeActivationRequest): Promise<NodeOutputs> {
    const policy = request.ctx.config.retryPolicy;
    return await this.retryRunner.run(policy, async () => {
      const nodeInstance = this.nodeInstanceFactory.createByType(request.ctx.config.type);
      if (request.kind === "multi") {
        return await this.executeMultiInputNode(request, nodeInstance);
      }
      return await this.executeSingleInputNode(request, nodeInstance);
    });
  }

  private async executeMultiInputNode(
    request: Extract<NodeActivationRequest, { kind: "multi" }>,
    node: unknown,
  ): Promise<NodeOutputs> {
    const multiInputNode = node as MultiInputNode;
    if (typeof (multiInputNode as { executeMulti?: unknown }).executeMulti !== "function") {
      throw new Error(`Node ${request.nodeId} does not support executeMulti but received multi-input activation`);
    }
    return await multiInputNode.executeMulti(request.inputsByPort, request.ctx as any);
  }

  private async executeSingleInputNode(
    request: Extract<NodeActivationRequest, { kind: "single" }>,
    node: unknown,
  ): Promise<NodeOutputs> {
    if (this.hasExecuteOne(node)) {
      return await this.executeItemNode(request, node);
    }
    const singleInputNode = node as Node;
    if (typeof (singleInputNode as { execute?: unknown }).execute !== "function") {
      throw new Error(`Node ${request.nodeId} does not support execute but received single-input activation`);
    }
    return await singleInputNode.execute(request.input, request.ctx as any);
  }

  private hasExecuteOne(node: unknown): node is { executeOne: (args: unknown) => unknown | Promise<unknown> } {
    return (
      typeof node === "object" && node !== null && typeof (node as { executeOne?: unknown }).executeOne === "function"
    );
  }

  private async executeItemNode(
    request: Extract<NodeActivationRequest, { kind: "single" }>,
    node: { executeOne: (args: unknown) => unknown | Promise<unknown> },
  ): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < request.input.length; i++) {
      const item = request.input[i] as Item;
      const outputJson = await Promise.resolve(
        node.executeOne({
          input: item.json,
          item,
          itemIndex: i,
          items: request.input,
          ctx: request.ctx,
        }),
      );
      out.push({ ...item, json: outputJson });
    }
    return { main: out };
  }
}

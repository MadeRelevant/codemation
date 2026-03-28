import type { MultiInputNode, Node, NodeActivationRequest, NodeOutputs, WorkflowNodeInstanceFactory } from "../types";

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
    const singleInputNode = node as Node;
    if (typeof (singleInputNode as { execute?: unknown }).execute !== "function") {
      throw new Error(`Node ${request.nodeId} does not support execute but received single-input activation`);
    }
    return await singleInputNode.execute(request.input, request.ctx as any);
  }
}

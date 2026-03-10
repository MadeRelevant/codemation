import type {
  NodeActivationReceipt,
  NodeActivationContinuation,
  NodeActivationRequest,
  NodeActivationScheduler,
  NodeExecutionRequest,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
} from "../../types";

import { InlineDrivingScheduler } from "./inlineDrivingScheduler";

export class DefaultDrivingScheduler implements NodeActivationScheduler {
  constructor(
    private readonly offloadPolicy: NodeOffloadPolicy,
    private readonly workerScheduler: NodeExecutionScheduler,
    private readonly inline: InlineDrivingScheduler = new InlineDrivingScheduler(),
  ) {}

  setContinuation(continuation: NodeActivationContinuation): void {
    this.inline.setContinuation(continuation);
  }

  async enqueue(request: NodeActivationRequest): Promise<NodeActivationReceipt> {
    const decision = this.offloadPolicy.decide({
      workflowId: request.workflowId,
      nodeId: request.nodeId,
      config: request.ctx.config,
    });

    if (decision.mode === "worker") {
      if (request.kind === "multi") {
        throw new Error(`Multi-input node ${request.nodeId} cannot be scheduled to worker (insert local placement)`);
      }

      const workerRequest: NodeExecutionRequest = {
        runId: request.runId,
        activationId: request.activationId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        input: request.input,
        parent: request.parent,
        queue: decision.queue,
      };

      const receipt = await this.workerScheduler.enqueue(workerRequest);
      return { receiptId: receipt.receiptId, mode: "worker", queue: decision.queue };
    }

    const receipt = await this.inline.enqueue(request);
    return { ...receipt, mode: "local" };
  }
}


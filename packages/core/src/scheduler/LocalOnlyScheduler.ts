import type { NodeExecutionRequest, NodeExecutionScheduler } from "../types";

export class LocalOnlyScheduler implements NodeExecutionScheduler {
  async enqueue(_request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    throw new Error("No worker scheduler configured");
  }
}

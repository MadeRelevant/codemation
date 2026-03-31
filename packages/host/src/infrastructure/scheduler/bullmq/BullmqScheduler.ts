import type { NodeExecutionRequest, NodeExecutionRequestHandler } from "@codemation/core";
import type { WorkerRuntimeScheduler } from "../WorkerRuntimeScheduler";
import type { RedisConnectionConfig } from "./RedisConnectionOptionsFactory";
import { BullmqNodeExecutionScheduler } from "./BullmqNodeExecutionScheduler";
import { BullmqWorker } from "./BullmqWorker";

export class BullmqScheduler implements WorkerRuntimeScheduler {
  private readonly scheduler: BullmqNodeExecutionScheduler;

  constructor(
    private readonly connection: RedisConnectionConfig,
    private readonly queuePrefix: string = "codemation",
  ) {
    this.scheduler = new BullmqNodeExecutionScheduler(connection, queuePrefix);
  }

  async enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    return await this.scheduler.enqueue(request);
  }

  async close(): Promise<void> {
    await this.scheduler.close();
  }

  createWorker(
    args: Readonly<{
      queues: ReadonlyArray<string>;
      requestHandler: NodeExecutionRequestHandler;
    }>,
  ): BullmqWorker {
    return new BullmqWorker(this.connection, args.queues, this.queuePrefix, args.requestHandler);
  }
}

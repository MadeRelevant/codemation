import type { NodeExecutionRequest, NodeExecutionScheduler } from "@codemation/core";
import { Queue } from "bullmq";
import type { RedisConnectionConfig } from "./RedisConnectionOptionsFactory";
import { RedisConnectionOptionsFactory } from "./RedisConnectionOptionsFactory";

type QueueName = string;

export class BullmqNodeExecutionScheduler implements NodeExecutionScheduler {
  private readonly connection: Readonly<Record<string, unknown>>;
  private readonly queuesByName = new Map<QueueName, Queue>();

  constructor(
    connection: RedisConnectionConfig,
    private readonly queuePrefix: string = "codemation",
  ) {
    this.connection = RedisConnectionOptionsFactory.fromConfig(connection);
  }

  async enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    const logical = request.queue ?? "default";
    const queueName = `${this.queuePrefix}.${logical}`;
    const queue = this.getOrCreateQueue(queueName);
    const jobId = `${request.runId}__${request.activationId}`;
    await queue.add("node-execution", { kind: "nodeExecution", request } as const, {
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return { receiptId: jobId };
  }

  async close(): Promise<void> {
    const queues = [...this.queuesByName.values()];
    this.queuesByName.clear();
    await Promise.all(queues.map((queue) => queue.close()));
  }

  private getOrCreateQueue(name: QueueName): Queue {
    const existing = this.queuesByName.get(name);
    if (existing) {
      return existing;
    }
    const queue = new Queue(name, { connection: this.connection as never });
    this.queuesByName.set(name, queue);
    return queue;
  }
}

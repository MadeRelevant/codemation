import type { NodeExecutionRequest, NodeExecutionScheduler } from "@codemation/core";
import { Queue } from "bullmq";

import type { RedisConnectionConfig } from "./redisConnection";
import { RedisConnectionOptionsFactory } from "./redisConnection";

type QueueName = string;

export class BullmqNodeExecutionScheduler implements NodeExecutionScheduler {
  private readonly connection: Readonly<Record<string, unknown>>;
  private readonly queuePrefix: string;
  private readonly queuesByName = new Map<QueueName, Queue>();

  constructor(connection: RedisConnectionConfig, queuePrefix: string = "codemation") {
    this.connection = RedisConnectionOptionsFactory.fromConfig(connection);
    this.queuePrefix = queuePrefix;
  }

  async enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    const logical = request.queue ?? "default";
    const queueName = `${this.queuePrefix}.${logical}`;
    const queue = this.getOrCreateQueue(queueName);

    // BullMQ custom ids cannot contain ":".
    const jobId = `${request.runId}__${request.activationId}`;
    await queue.add("node-execution", { kind: "nodeExecution", request } as const, {
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    });

    return { receiptId: jobId };
  }

  async close(): Promise<void> {
    const qs = [...this.queuesByName.values()];
    this.queuesByName.clear();
    await Promise.all(qs.map((q) => q.close()));
  }

  private getOrCreateQueue(name: QueueName): Queue {
    const existing = this.queuesByName.get(name);
    if (existing) return existing;

    const q = new Queue(name, { connection: this.connection as any });
    this.queuesByName.set(name, q);
    return q;
  }
}

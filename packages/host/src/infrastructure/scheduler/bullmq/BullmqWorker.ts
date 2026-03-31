import type { NodeExecutionRequest, NodeExecutionRequestHandler } from "@codemation/core";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import type { RedisConnectionConfig } from "./RedisConnectionOptionsFactory";
import { RedisConnectionOptionsFactory } from "./RedisConnectionOptionsFactory";

type NodeExecutionJobData = Readonly<{
  kind: "nodeExecution";
  request: NodeExecutionRequest;
}>;

export class BullmqWorker {
  private readonly connection: Readonly<Record<string, unknown>>;
  private readonly workers: Worker[] = [];

  constructor(
    connection: RedisConnectionConfig,
    queues: ReadonlyArray<string>,
    queuePrefix: string,
    private readonly requestHandler: NodeExecutionRequestHandler,
  ) {
    this.connection = RedisConnectionOptionsFactory.fromConfig(connection);
    for (const queue of queues) {
      const queueName = `${queuePrefix}.${queue}`;
      this.workers.push(
        new Worker(queueName, async (job: Job) => await this.processJob(queueName, job), {
          connection: this.connection as never,
        }),
      );
    }
  }

  async waitUntilReady(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.waitUntilReady()));
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private async processJob(queueName: string, job: Job): Promise<void> {
    const data = job.data as NodeExecutionJobData;
    if (!data || data.kind !== "nodeExecution") {
      throw new Error(`Unexpected job payload for queue ${queueName}`);
    }
    await this.requestHandler.handleNodeExecutionRequest(data.request);
  }
}

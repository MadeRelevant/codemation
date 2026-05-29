import { Queue } from "bullmq";
import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { AppConfig } from "../presentation/config/AppConfig";
import { RedisConnectionOptionsFactory } from "../infrastructure/scheduler/bullmq/RedisConnectionOptionsFactory";

export const HITL_TIMEOUT_QUEUE_NAME_SUFFIX = "hitl.timeout";

export interface HitlTimeoutJobPayload {
  readonly kind: "hitl.timeout";
  readonly taskId: string;
}

/**
 * Schedules delayed BullMQ jobs that drive the timeout path for suspended HITL tasks.
 * The processor (`HitlTimeoutJobProcessor`) handles these jobs.
 *
 * Job id: `hitl_timeout__<taskId>` — stable id allows reliable removal via `remove()`.
 */
@injectable()
export class HitlTimeoutJobScheduler {
  private queue: Queue | null = null;
  private readonly queueName: string;
  private readonly redisUrl: string;

  constructor(@inject(ApplicationTokens.AppConfig) appConfig: AppConfig) {
    const rawRedisUrl = appConfig.env.REDIS_URL ?? appConfig.env.CODEMATION_REDIS_URL;
    // Defer URL parsing to queue construction so DI consumers that never enqueue
    // (e.g. `codemation user create` with REDIS_URL="") can resolve this scheduler
    // without throwing. fromUrl runs the first time getOrCreateQueue() fires.
    this.redisUrl = rawRedisUrl && rawRedisUrl !== "" ? rawRedisUrl : "redis://127.0.0.1:6379";
    const queuePrefix = appConfig.env.CODEMATION_BULLMQ_PREFIX ?? "codemation";
    this.queueName = `${queuePrefix}.${HITL_TIMEOUT_QUEUE_NAME_SUFFIX}`;
  }

  async enqueueTimeoutJob(args: { taskId: string; expiresAt: Date }): Promise<void> {
    const queue = this.getOrCreateQueue();
    const delay = Math.max(0, args.expiresAt.getTime() - Date.now());
    await queue.add("hitl.timeout", { kind: "hitl.timeout", taskId: args.taskId } satisfies HitlTimeoutJobPayload, {
      jobId: this.makeJobId(args.taskId),
      delay,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async cancelTimeoutJob(taskId: string): Promise<void> {
    const queue = this.getOrCreateQueue();
    const job = await queue.getJob(this.makeJobId(taskId));
    await job?.remove();
  }

  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  getQueueName(): string {
    return this.queueName;
  }

  private getOrCreateQueue(): Queue {
    if (!this.queue) {
      const connectionOptions = RedisConnectionOptionsFactory.fromConfig({ url: this.redisUrl });
      this.queue = new Queue(this.queueName, {
        connection: connectionOptions as never,
      });
    }
    return this.queue;
  }

  private makeJobId(taskId: string): string {
    return `hitl_timeout__${taskId}`;
  }
}

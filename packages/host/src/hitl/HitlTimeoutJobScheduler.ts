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
  /** Redis URL when running in BullMQ mode; null in local/inline mode (no Redis). */
  private readonly redisUrl: string | null;

  constructor(@inject(ApplicationTokens.AppConfig) appConfig: AppConfig) {
    // Gate BullMQ on the same scheduler abstraction the rest of the host uses
    // (AppConfigFactory resolves kind === "bullmq" only when a Redis URL is
    // present; otherwise "local"). In local/inline mode this scheduler does NOT
    // touch Redis at all — enqueue/cancel become inert no-ops — so workspace
    // pods without a Redis don't crash-loop on ECONNREFUSED 127.0.0.1:6379.
    this.redisUrl = appConfig.scheduler.kind === "bullmq" ? (appConfig.scheduler.redisUrl ?? null) : null;
    const queuePrefix = appConfig.env.CODEMATION_BULLMQ_PREFIX ?? "codemation";
    this.queueName = `${queuePrefix}.${HITL_TIMEOUT_QUEUE_NAME_SUFFIX}`;
  }

  async enqueueTimeoutJob(args: { taskId: string; expiresAt: Date }): Promise<void> {
    const queue = this.getOrCreateQueue();
    if (!queue) return; // local/inline mode: no background timeout job.
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
    if (!queue) return; // local/inline mode: nothing was ever enqueued.
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

  /**
   * Returns the BullMQ queue in Redis-backed mode, or null in local/inline mode.
   * Construction is deferred to the first enqueue/cancel so DI consumers that
   * never enqueue can resolve this scheduler without building a connection.
   */
  private getOrCreateQueue(): Queue | null {
    if (this.redisUrl === null) {
      return null;
    }
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

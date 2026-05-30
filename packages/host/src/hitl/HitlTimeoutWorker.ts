import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { inject, injectable } from "@codemation/core";
import type { HumanTaskStore } from "@codemation/core";
import { CodemationTelemetryAttributeNames, HumanTaskStoreToken } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { ApplicationTokens } from "../applicationTokens";
import type { AppConfig } from "../presentation/config/AppConfig";
import { RedisConnectionOptionsFactory } from "../infrastructure/scheduler/bullmq/RedisConnectionOptionsFactory";
import type { HitlTimeoutJobPayload } from "./HitlTimeoutJobScheduler";
import { HitlTimeoutJobScheduler } from "./HitlTimeoutJobScheduler";
import { ResumeTelemetryContextForRun } from "../application/telemetry/ResumeTelemetryContextForRun";

/**
 * BullMQ worker that processes `hitl.timeout` jobs.
 *
 * - If `task.onTimeout === "auto-accept"`: marks the task `auto_accepted` and resumes the run
 *   with `decision: { kind: "auto_accepted" }`.
 * - If `task.onTimeout === "halt"`: marks the task `timed_out` and resumes the run
 *   with `decision: { kind: "timed_out" }`.
 *
 * The engine's resume handler distinguishes halt vs. continue based on the decision kind
 * (the first-class HITL states handle the halt-the-run path).
 *
 * `processTimeoutForTask` is public to allow direct testing without BullMQ.
 */
@injectable()
export class HitlTimeoutWorker {
  private readonly taskStore: HumanTaskStore;
  private worker: Worker | null = null;
  /** Redis connection options in BullMQ mode; null in local/inline mode (no Redis). */
  private readonly connectionOptions: Readonly<Record<string, unknown>> | null;

  constructor(
    @inject(HumanTaskStoreToken) taskStore: HumanTaskStore | undefined,
    @inject(Engine) private readonly engine: Engine,
    @inject(HitlTimeoutJobScheduler) private readonly scheduler: HitlTimeoutJobScheduler,
    @inject(ApplicationTokens.AppConfig) appConfig: AppConfig,
    @inject(ResumeTelemetryContextForRun) private readonly resumeTelemetry: ResumeTelemetryContextForRun,
  ) {
    if (!taskStore) {
      throw new Error("HitlTimeoutWorker: HumanTaskStore is not registered.");
    }
    this.taskStore = taskStore;
    // Same gate as HitlTimeoutJobScheduler: only build a Redis connection when
    // running in BullMQ mode. In local/inline mode start() is a no-op — there is
    // no Redis to consume timeout jobs from.
    const redisUrl = appConfig.scheduler.kind === "bullmq" ? (appConfig.scheduler.redisUrl ?? null) : null;
    this.connectionOptions = redisUrl === null ? null : RedisConnectionOptionsFactory.fromConfig({ url: redisUrl });
  }

  start(): void {
    if (!this.connectionOptions) return; // local/inline mode: no background worker.
    this.worker = new Worker(
      this.scheduler.getQueueName(),
      async (job: Job) => {
        await this.processJob(job);
      },
      { connection: this.connectionOptions as never },
    );
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  async processTimeoutForTask(taskId: string): Promise<void> {
    const task = await this.taskStore.findById(taskId);
    if (!task) return;
    if (task.status !== "pending") return;

    const now = new Date();

    if (task.onTimeout === "auto-accept") {
      await this.taskStore.markAutoAccepted(taskId);

      // Emit hitl.task.timed_out on the run's trace.
      const telemetry = await this.resumeTelemetry.forTask(taskId);
      await telemetry?.addSpanEvent({
        name: "hitl.task.timed_out",
        attributes: {
          [CodemationTelemetryAttributeNames.hitlTaskId]: taskId,
          policy: "auto-accept",
        },
      });

      await this.engine.resumeRun({
        runId: task.runId,
        taskId: task.id,
        resumeContext: {
          decision: { kind: "auto_accepted", at: now },
          delivery: task.deliveryRef ?? null,
          task: {
            taskId: task.id,
            runId: task.runId,
            nodeId: task.nodeId,
            expiresAt: task.expiresAt,
            resumeUrl: "",
          },
        },
      });
    } else {
      await this.taskStore.markTimedOut(taskId);

      // Emit hitl.task.timed_out on the run's trace.
      const telemetry = await this.resumeTelemetry.forTask(taskId);
      await telemetry?.addSpanEvent({
        name: "hitl.task.timed_out",
        attributes: {
          [CodemationTelemetryAttributeNames.hitlTaskId]: taskId,
          policy: "halt",
        },
      });

      await this.engine.resumeRun({
        runId: task.runId,
        taskId: task.id,
        resumeContext: {
          decision: { kind: "timed_out", at: now },
          delivery: task.deliveryRef ?? null,
          task: {
            taskId: task.id,
            runId: task.runId,
            nodeId: task.nodeId,
            expiresAt: task.expiresAt,
            resumeUrl: "",
          },
        },
      });
    }
  }

  private async processJob(job: Job): Promise<void> {
    const data = job.data as HitlTimeoutJobPayload;
    if (!data || data.kind !== "hitl.timeout") {
      throw new Error(`Unexpected job payload for hitl.timeout queue: ${JSON.stringify(data)}`);
    }
    await this.processTimeoutForTask(data.taskId);
  }
}

import type { BinaryStorage, Clock, RunId, WorkflowId } from "@codemation/core";
import { CoreTokens, RunFinishedAtFactory } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import type { Logger } from "../logging/Logger";
import { RunStateBinaryStorageKeysCollector } from "../binary/RunStateBinaryStorageKeysCollector";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { ServerLoggerFactory } from "../../infrastructure/logging/ServerLoggerFactory";

/**
 * Periodically deletes terminal workflow runs whose age exceeds the effective retention
 * (`policySnapshot.retentionSeconds` or `CODEMATION_RUN_RETENTION_DEFAULT_SECONDS`),
 * and removes binary blobs referenced from run state via {@link BinaryStorage}.
 */
@injectable()
export class WorkflowRunRetentionPruneScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly logger: Logger;
  private readonly binaryKeysCollector = new RunStateBinaryStorageKeysCollector();

  constructor(
    @inject(ApplicationTokens.Clock) private readonly clock: Clock,
    @inject(ApplicationTokens.WorkflowRunRepository) private readonly runs: WorkflowRunRepository,
    @inject(CoreTokens.BinaryStorage) private readonly binaryStorage: BinaryStorage,
    @inject(ApplicationTokens.ProcessEnv) private readonly env: NodeJS.ProcessEnv,
    @inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.runRetentionPrune");
  }

  start(): void {
    if (this.env.CODEMATION_RUN_PRUNE_ENABLED === "false") {
      return;
    }
    if (this.timer) {
      return;
    }
    const intervalMs = Number(this.env.CODEMATION_RUN_PRUNE_INTERVAL_MS ?? 60_000);
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.warn(`Run retention prune tick failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Exposed for tests; production path is the interval started by {@link start}. */
  async runOnce(): Promise<void> {
    this.logger.debug("Run retention prune: starting check");

    const defaultRetentionSec = Number(this.env.CODEMATION_RUN_RETENTION_DEFAULT_SECONDS ?? 86_400);
    const summaries = await this.runs.listRuns({ limit: 500 });
    const nowMs = this.clock.now().getTime();

    let foundCount = 0;
    let prunedCount = 0;
    for (const s of summaries) {
      if (s.status !== "completed" && s.status !== "failed") {
        continue;
      }
      const state = await this.runs.load(s.runId);
      if (!state) {
        continue;
      }
      const retentionSec = state.policySnapshot?.retentionSeconds ?? defaultRetentionSec;
      const finishedAt = RunFinishedAtFactory.resolveIso(state) ?? s.finishedAt;
      if (!finishedAt) {
        continue;
      }
      const ageMs = nowMs - Date.parse(finishedAt);
      if (ageMs <= retentionSec * 1000) {
        continue;
      }

      const runId = s.runId as RunId;
      const workflowId = s.workflowId as WorkflowId;
      foundCount += 1;

      const storageKeys = this.binaryKeysCollector.collectFromRunState(state);
      for (const key of storageKeys) {
        await this.binaryStorage.delete(key);
      }
      await this.runs.deleteRun(runId);
      prunedCount += 1;
      this.logger.debug(`Run retention prune: pruned run ${runId} for workflow ${workflowId}`);
    }

    this.logger.info(`Run retention prune: found ${foundCount} run(s) to prune`);
    this.logger.info(`Run retention prune: pruned ${prunedCount} run(s)`);
  }
}

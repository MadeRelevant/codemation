import type { BinaryStorage, Clock, RunId, WorkflowId } from "@codemation/core";
import { CoreTokens } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import type { Logger } from "../logging/Logger";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import type {
  TelemetryArtifactStore,
  TelemetryMetricPointStore,
  TelemetrySpanStore,
} from "../../domain/telemetry/TelemetryContracts";
import { ServerLoggerFactory } from "../../infrastructure/logging/ServerLoggerFactory";

/**
 * Periodically deletes terminal workflow runs whose age exceeds the effective retention
 * (`policySnapshot.retentionSeconds` or `CODEMATION_RUN_RETENTION_DEFAULT_SECONDS`),
 * removes binary blobs referenced from run state via {@link BinaryStorage}, and
 * independently prunes spans, artifacts, and metric points once their own retention
 * timestamps expire.
 */
@injectable()
export class WorkflowRunRetentionPruneScheduler {
  private static readonly defaultIntervalMs = 60 * 60 * 1_000;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly logger: Logger;

  constructor(
    @inject(ApplicationTokens.Clock) private readonly clock: Clock,
    @inject(ApplicationTokens.WorkflowRunRepository) private readonly runs: WorkflowRunRepository,
    @inject(CoreTokens.BinaryStorage) private readonly binaryStorage: BinaryStorage,
    @inject(ApplicationTokens.TelemetrySpanStore) private readonly telemetrySpanStore: TelemetrySpanStore,
    @inject(ApplicationTokens.TelemetryArtifactStore) private readonly telemetryArtifactStore: TelemetryArtifactStore,
    @inject(ApplicationTokens.TelemetryMetricPointStore)
    private readonly telemetryMetricPointStore: TelemetryMetricPointStore,
    @inject(ApplicationTokens.AppConfig) private readonly appConfig: AppConfig,
    @inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.runRetentionPrune");
  }

  start(): void {
    if (
      this.appConfig.env.CODEMATION_RUN_PRUNE_ENABLED === "false" &&
      this.appConfig.env.CODEMATION_TELEMETRY_PRUNE_ENABLED === "false"
    ) {
      return;
    }
    if (this.timer) {
      return;
    }
    const intervalMs = Number(
      this.appConfig.env.CODEMATION_RUN_PRUNE_INTERVAL_MS ?? WorkflowRunRetentionPruneScheduler.defaultIntervalMs,
    );
    void this.runScheduledTick();
    this.timer = setInterval(() => {
      void this.runScheduledTick();
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
    const defaultRetentionSec = Number(this.appConfig.env.CODEMATION_RUN_RETENTION_DEFAULT_SECONDS ?? 86_400);
    const nowIso = this.clock.now().toISOString();
    let foundCount = 0;
    let prunedCount = 0;
    if (this.appConfig.env.CODEMATION_RUN_PRUNE_ENABLED !== "false") {
      const summaries = await this.runs.listRunsOlderThan?.({
        nowIso,
        defaultRetentionSeconds: defaultRetentionSec,
        limit: 500,
      });
      const candidates =
        summaries ??
        (await this.runs.listRuns({ limit: 500 })).filter(
          (summary) => summary.status === "completed" || summary.status === "failed",
        );
      for (const candidate of candidates) {
        const runId = candidate.runId as RunId;
        const workflowId = candidate.workflowId as WorkflowId;
        foundCount += 1;

        const storageKeys =
          (await this.runs.listBinaryStorageKeys?.(runId)) ?? (await this.loadStorageKeysFromRunStateFallback(runId));
        for (const key of storageKeys) {
          await this.binaryStorage.delete(key);
        }
        await this.runs.deleteRun(runId);
        prunedCount += 1;
        this.logger.debug(`Run retention prune: pruned run ${runId} for workflow ${workflowId}`);
      }
    }

    let prunedSpanCount = 0;
    let prunedArtifactCount = 0;
    let prunedMetricCount = 0;
    if (this.appConfig.env.CODEMATION_TELEMETRY_PRUNE_ENABLED !== "false") {
      const telemetryLimit = Number(this.appConfig.env.CODEMATION_TELEMETRY_PRUNE_LIMIT ?? 2_000);
      prunedSpanCount = await this.telemetrySpanStore.pruneExpired({ nowIso, limit: telemetryLimit });
      prunedArtifactCount = await this.telemetryArtifactStore.pruneExpired({ nowIso, limit: telemetryLimit });
      prunedMetricCount = await this.telemetryMetricPointStore.pruneExpired({ nowIso, limit: telemetryLimit });
    }

    const totalPruned = foundCount + prunedCount + prunedSpanCount + prunedArtifactCount + prunedMetricCount;
    if (totalPruned === 0) {
      return;
    }
    this.logger.info(`Run retention prune: found ${foundCount} run(s) to prune`);
    this.logger.info(`Run retention prune: pruned ${prunedCount} run(s)`);
    this.logger.info(`Run retention prune: pruned ${prunedSpanCount} telemetry span(s)`);
    this.logger.info(`Run retention prune: pruned ${prunedArtifactCount} telemetry artifact(s)`);
    this.logger.info(`Run retention prune: pruned ${prunedMetricCount} telemetry metric point(s)`);
  }

  private async runScheduledTick(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.warn(`Run retention prune tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadStorageKeysFromRunStateFallback(runId: RunId): Promise<ReadonlyArray<string>> {
    const state = await this.runs.load(runId);
    if (!state) {
      return [];
    }
    const keys = new Set<string>();
    this.collectStorageKeysFromValue(state.outputsByNode, keys);
    this.collectStorageKeysFromValue(state.nodeSnapshotsByNodeId, keys);
    this.collectStorageKeysFromValue(state.mutableState, keys);
    return [...keys];
  }

  private collectStorageKeysFromValue(value: unknown, keys: Set<string>): void {
    if (Array.isArray(value)) {
      for (const entry of value) {
        this.collectStorageKeysFromValue(entry, keys);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.id === "string" &&
      typeof record.storageKey === "string" &&
      typeof record.mimeType === "string" &&
      typeof record.size === "number"
    ) {
      if (record.storageKey.length > 0) {
        keys.add(record.storageKey);
      }
      return;
    }
    for (const child of Object.values(record)) {
      this.collectStorageKeysFromValue(child, keys);
    }
  }
}

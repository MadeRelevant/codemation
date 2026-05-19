import type { Clock } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { Logger } from "./logging/Logger";
import type { AppConfig } from "../presentation/config/AppConfig";
import { ServerLoggerFactory } from "../infrastructure/logging/ServerLoggerFactory";
import {
  PrismaDatabaseClientToken,
  type PrismaDatabaseClient,
} from "../infrastructure/persistence/PrismaDatabaseClient";

/**
 * Periodically deletes WorkflowAuditLog rows older than the configured retention period.
 *
 * Default retention: 90 days.
 * Override: `CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS` in env.
 * Disable: `CODEMATION_AUDIT_PRUNE_ENABLED=false`.
 */
@injectable()
export class WorkflowAuditLogPruneScheduler {
  static readonly defaultIntervalMs = 60 * 60 * 1_000;
  /** 90 days in seconds (default retention). */
  static readonly defaultRetentionSeconds = 90 * 24 * 3600;

  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly logger: Logger;

  constructor(
    @inject(ApplicationTokens.Clock) private readonly clock: Clock,
    @inject(PrismaDatabaseClientToken) private readonly prisma: PrismaDatabaseClient,
    @inject(ApplicationTokens.AppConfig) private readonly appConfig: AppConfig,
    @inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.auditPrune");
  }

  start(): void {
    if (this.appConfig.env.CODEMATION_AUDIT_PRUNE_ENABLED === "false") {
      return;
    }
    if (this.timer) {
      return;
    }
    const intervalMs = Number(
      this.appConfig.env.CODEMATION_AUDIT_PRUNE_INTERVAL_MS ??
        this.appConfig.env.CODEMATION_RUN_PRUNE_INTERVAL_MS ??
        WorkflowAuditLogPruneScheduler.defaultIntervalMs,
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
    const retentionSec = Number(
      this.appConfig.env.CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS ??
        WorkflowAuditLogPruneScheduler.defaultRetentionSeconds,
    );
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - retentionSec * 1000);
    const limit = Number(this.appConfig.env.CODEMATION_TELEMETRY_PRUNE_LIMIT ?? 2_000);

    // Two-step delete: find IDs first (respects limit), then delete by ID.
    const rows = await this.prisma.workflowAuditLog.findMany({
      where: { occurredAt: { lt: cutoff } },
      select: { id: true },
      take: limit,
    });

    if (rows.length === 0) {
      return;
    }

    const ids = rows.map((r) => r.id);
    await this.prisma.workflowAuditLog.deleteMany({ where: { id: { in: ids } } });

    this.logger.info(`WorkflowAuditLog prune: deleted ${ids.length} row(s) older than ${cutoff.toISOString()}`);
  }

  private async runScheduledTick(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.warn(`WorkflowAuditLog prune tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

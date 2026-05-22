import type { Container } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { RunEventBusTelemetryReporter } from "../application/telemetry/RunEventBusTelemetryReporter";
import { WorkflowRunRetentionPruneScheduler } from "../application/runs/WorkflowRunRetentionPruneScheduler";
import { WorkflowAuditLogPruneScheduler } from "../application/WorkflowAuditLogPruneScheduler";
import type { PrismaDatabaseClient } from "../infrastructure/persistence/PrismaDatabaseClient";
import { WorkflowRunEventWebsocketRelay } from "../application/websocket/WorkflowRunEventWebsocketRelay";
import { WorkflowWebsocketServer } from "../presentation/websocket/WorkflowWebsocketServer";
import { McpConnectionPool } from "../mcp/McpConnectionPool";
// TODO: delete in cleanup — McpRegistryFetcher replaced by ControlPlaneCatalogFetcher.
import { McpRegistryFetcher } from "../mcp/McpRegistryFetcher";
import { WorkflowAuditLogWriter } from "../audit/WorkflowAuditLogWriter";
import { ControlPlaneCatalogFetcher } from "../credentials/ControlPlaneCatalogFetcher";

export class AppContainerLifecycle {
  constructor(
    private readonly container: Container,
    private readonly ownedPrismaClient: PrismaDatabaseClient | null,
  ) {}

  async start(): Promise<void> {
    if (this.container.isRegistered(ControlPlaneCatalogFetcher, true)) {
      await this.container.resolve(ControlPlaneCatalogFetcher).start();
    }
    // TODO: delete in cleanup — McpRegistryFetcher.start() removed; ControlPlaneCatalogFetcher replaces it.
  }

  async startWorkerSubscribers(): Promise<void> {
    if (this.container.isRegistered(WorkflowAuditLogWriter, true)) {
      await this.container.resolve(WorkflowAuditLogWriter).start();
    }
    if (this.container.isRegistered(WorkflowAuditLogPruneScheduler, true)) {
      this.container.resolve(WorkflowAuditLogPruneScheduler).start();
    }
  }

  async stop(args?: Readonly<{ stopWebsocketServer?: boolean }>): Promise<void> {
    if (this.container.isRegistered(Engine, true)) {
      await this.container.resolve(Engine).stop();
    }
    if (this.container.isRegistered(WorkflowRunEventWebsocketRelay, true)) {
      await this.container.resolve(WorkflowRunEventWebsocketRelay).stop();
    }
    if (this.container.isRegistered(RunEventBusTelemetryReporter, true)) {
      await this.container.resolve(RunEventBusTelemetryReporter).stop();
    }
    if (this.container.isRegistered(WorkflowAuditLogWriter, true)) {
      await this.container.resolve(WorkflowAuditLogWriter).stop();
    }
    if (this.container.isRegistered(WorkflowRunRetentionPruneScheduler, true)) {
      this.container.resolve(WorkflowRunRetentionPruneScheduler).stop();
    }
    if (this.container.isRegistered(WorkflowAuditLogPruneScheduler, true)) {
      this.container.resolve(WorkflowAuditLogPruneScheduler).stop();
    }
    if (args?.stopWebsocketServer !== false && this.container.isRegistered(WorkflowWebsocketServer, true)) {
      await this.container.resolve(WorkflowWebsocketServer).stop();
    }
    if (this.container.isRegistered(McpConnectionPool, true)) {
      await this.container.resolve(McpConnectionPool).closeAll();
    }
    if (this.container.isRegistered(ControlPlaneCatalogFetcher, true)) {
      await this.container.resolve(ControlPlaneCatalogFetcher).stop();
    }
    // TODO: delete in cleanup — McpRegistryFetcher.stop() removed; ControlPlaneCatalogFetcher replaces it.
    if (this.ownedPrismaClient) {
      await this.ownedPrismaClient.$disconnect();
    }
  }
}

import type { Container } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { RunEventBusTelemetryReporter } from "../application/telemetry/RunEventBusTelemetryReporter";
import { WorkflowRunRetentionPruneScheduler } from "../application/runs/WorkflowRunRetentionPruneScheduler";
import type { PrismaDatabaseClient } from "../infrastructure/persistence/PrismaDatabaseClient";
import { WorkflowRunEventWebsocketRelay } from "../application/websocket/WorkflowRunEventWebsocketRelay";
import { WorkflowWebsocketServer } from "../presentation/websocket/WorkflowWebsocketServer";
import { McpConnectionPool } from "../mcp/McpConnectionPool";
import { McpRegistryFetcher } from "../mcp/McpRegistryFetcher";
import { WorkflowAuditLogWriter } from "../audit/WorkflowAuditLogWriter";

export class AppContainerLifecycle {
  constructor(
    private readonly container: Container,
    private readonly ownedPrismaClient: PrismaDatabaseClient | null,
  ) {}

  async start(): Promise<void> {
    if (this.container.isRegistered(McpRegistryFetcher, true)) {
      await this.container.resolve(McpRegistryFetcher).start();
    }
  }

  async startWorkerSubscribers(): Promise<void> {
    if (this.container.isRegistered(WorkflowAuditLogWriter, true)) {
      await this.container.resolve(WorkflowAuditLogWriter).start();
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
    if (args?.stopWebsocketServer !== false && this.container.isRegistered(WorkflowWebsocketServer, true)) {
      await this.container.resolve(WorkflowWebsocketServer).stop();
    }
    if (this.container.isRegistered(McpConnectionPool, true)) {
      await this.container.resolve(McpConnectionPool).closeAll();
    }
    if (this.container.isRegistered(McpRegistryFetcher, true)) {
      await this.container.resolve(McpRegistryFetcher).stop();
    }
    if (this.ownedPrismaClient) {
      await this.ownedPrismaClient.$disconnect();
    }
  }
}

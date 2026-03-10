import type { WorkflowDefinition } from "@codemation/core";
import type { RealtimeRuntimeDiagnostics } from "./realtimeRuntimeFactory";

export interface StartupSummaryLogger {
  info(message: string): void;
}

export interface FrontendStartupSummaryArgs {
  processLabel: string;
  runtime: RealtimeRuntimeDiagnostics;
  websocketHost: string;
  websocketPort: number;
  workflowDefinitions: ReadonlyArray<WorkflowDefinition>;
  triggerStatusLabel: string;
  bootstrapSource: string | null;
  workflowSources: ReadonlyArray<string>;
}

export interface WorkerStartupSummaryArgs {
  processLabel: string;
  runtime: RealtimeRuntimeDiagnostics;
  workflowDefinitions: ReadonlyArray<WorkflowDefinition>;
  queues: ReadonlyArray<string>;
  bootstrapSource: string | null;
  workflowSources: ReadonlyArray<string>;
}

class WorkflowTriggerStats {
  readonly workflowCount: number;
  readonly triggerWorkflowCount: number;
  readonly triggerNodeCount: number;

  constructor(workflowDefinitions: ReadonlyArray<WorkflowDefinition>) {
    this.workflowCount = workflowDefinitions.length;
    this.triggerWorkflowCount = workflowDefinitions.filter((workflow) => workflow.nodes.some((node) => node.kind === "trigger")).length;
    this.triggerNodeCount = workflowDefinitions.reduce(
      (count, workflow) => count + workflow.nodes.filter((node) => node.kind === "trigger").length,
      0,
    );
  }
}

export class ConsoleStartupSummaryLogger implements StartupSummaryLogger {
  info(message: string): void {
    console.info(message);
  }
}

export class CodemationStartupSummaryReporter {
  constructor(private readonly logger: StartupSummaryLogger) {}

  reportFrontend(args: FrontendStartupSummaryArgs): void {
    const triggerStats = new WorkflowTriggerStats(args.workflowDefinitions);
    this.logger.info(
      this.buildBanner([
        `${this.normalizeTitle(args.processLabel)}`,
        `db info                sqlite at ${args.runtime.dbPath}`,
        `redis pub/sub info     ${this.formatPubSub(args.runtime)}`,
        `websocket info         ws://${this.formatWebsocketClientHost(args.websocketHost)}:${args.websocketPort} (bind ${args.websocketHost}:${args.websocketPort})`,
        `scheduler info         ${this.formatScheduler(args.runtime)}`,
        `workflow trigger status ${args.triggerStatusLabel} (${triggerStats.triggerWorkflowCount} workflows, ${triggerStats.triggerNodeCount} trigger nodes)`,
        `workflows loaded       ${triggerStats.workflowCount}`,
        `bootstrap source      ${args.bootstrapSource ?? "none discovered"}`,
        `workflow sources      ${this.formatWorkflowSources(args.workflowSources)}`,
      ]),
    );
  }

  reportWorker(args: WorkerStartupSummaryArgs): void {
    const triggerStats = new WorkflowTriggerStats(args.workflowDefinitions);
    this.logger.info(
      this.buildBanner([
        `${this.normalizeTitle(args.processLabel)}`,
        `db info                sqlite at ${args.runtime.dbPath}`,
        `redis pub/sub info     ${this.formatPubSub(args.runtime)}`,
        "websocket info         not applicable in worker mode",
        `scheduler info         ${this.formatScheduler(args.runtime)} (queues: ${args.queues.join(", ") || "none"})`,
        `workflow trigger status disabled in worker mode (${triggerStats.triggerWorkflowCount} workflows, ${triggerStats.triggerNodeCount} trigger nodes configured)`,
        `workflows loaded       ${triggerStats.workflowCount}`,
        `bootstrap source      ${args.bootstrapSource ?? "none discovered"}`,
        `workflow sources      ${this.formatWorkflowSources(args.workflowSources)}`,
      ]),
    );
  }

  private formatWorkflowSources(workflowSources: ReadonlyArray<string>): string {
    return workflowSources.length > 0 ? workflowSources.join(", ") : "none discovered";
  }

  private formatPubSub(runtime: RealtimeRuntimeDiagnostics): string {
    if (runtime.eventBusKind === "memory") return "disabled, using in-memory event bus";
    return `enabled via redis (${this.sanitizeRedisUrl(runtime.redisUrl ?? "unknown")}, prefix: ${runtime.queuePrefix ?? "codemation"})`;
  }

  private formatScheduler(runtime: RealtimeRuntimeDiagnostics): string {
    if (runtime.schedulerKind === "inline") return "local inline scheduler";
    return `bullmq worker scheduler (prefix: ${runtime.queuePrefix ?? "codemation"})`;
  }

  private formatWebsocketClientHost(host: string): string {
    return host === "0.0.0.0" ? "127.0.0.1" : host;
  }

  private sanitizeRedisUrl(redisUrl: string): string {
    try {
      const parsed = new URL(redisUrl);
      const authPart = parsed.username || parsed.password ? `${parsed.username ? `${parsed.username}:` : ""}${parsed.password ? "***" : ""}@` : "";
      return `${parsed.protocol}//${authPart}${parsed.host}${parsed.pathname}`;
    } catch {
      return redisUrl;
    }
  }

  private buildBanner(lines: ReadonlyArray<string>): string {
    const contentWidth = Math.max(...lines.map((line) => line.length), 10);
    const border = `+${"-".repeat(contentWidth + 2)}+`;
    const renderedLines = lines.map((line, index) => {
      const padded = line.padEnd(contentWidth, " ");
      if (index === 0) return `| ${padded} |`;
      return `| ${padded} |`;
    });
    return [border, ...renderedLines, border].join("\n");
  }

  private normalizeTitle(processLabel: string): string {
    return `[codemation] ${processLabel.toUpperCase()}`;
  }
}

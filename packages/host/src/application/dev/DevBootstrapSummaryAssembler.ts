import { CoreTokens, inject, injectable } from "@codemation/core";
import type { WorkflowRepository } from "@codemation/core";
import { BootRuntimeSnapshotHolder } from "./BootRuntimeSnapshotHolder";
import { LogLevelPolicyFactory } from "../../infrastructure/logging/LogLevelPolicyFactory";
import { RuntimeWorkflowActivationPolicy } from "../../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import type { BootRuntimeSummary } from "./BootRuntimeSummary.types";
import type { DevBootstrapSummaryJson } from "./DevBootstrapSummaryJson.types";

@injectable()
export class DevBootstrapSummaryAssembler {
  constructor(
    @inject(BootRuntimeSnapshotHolder) private readonly bootRuntimeSnapshot: BootRuntimeSnapshotHolder,
    @inject(LogLevelPolicyFactory) private readonly logLevelPolicyFactory: LogLevelPolicyFactory,
    @inject(RuntimeWorkflowActivationPolicy) private readonly workflowActivationPolicy: RuntimeWorkflowActivationPolicy,
    @inject(CoreTokens.WorkflowRepository) private readonly workflowRepository: WorkflowRepository,
  ) {}

  assemble(): DevBootstrapSummaryJson | null {
    const summary = this.bootRuntimeSnapshot.get();
    if (!summary) {
      return null;
    }
    const envRaw = process.env.CODEMATION_LOG_LEVEL?.trim();
    const min = this.logLevelPolicyFactory.create().resolveMin();
    const logLevel = envRaw && envRaw.length > 0 ? `${min} (CODEMATION_LOG_LEVEL=${envRaw})` : `${min}`;
    const workflows = [...this.workflowRepository.list()].sort((a, b) => a.name.localeCompare(b.name));
    const active = workflows
      .filter((w) => this.workflowActivationPolicy.isActive(w.id))
      .map((w) => ({ id: w.id, name: w.name }));
    return {
      logLevel,
      codemationLogLevelEnv: envRaw && envRaw.length > 0 ? envRaw : undefined,
      databaseLabel: this.formatDatabase(summary),
      schedulerLabel: this.formatScheduler(summary),
      eventBusLabel: this.formatEventBus(summary),
      redisUrlRedacted: this.formatRedis(summary),
      activeWorkflows: active,
    };
  }

  private formatDatabase(summary: BootRuntimeSummary): string {
    const p = summary.databasePersistence;
    if (p.kind === "none") {
      return "in-memory (no Prisma persistence)";
    }
    if (p.kind === "pglite") {
      return `PGlite — ${p.dataDir}`;
    }
    return `PostgreSQL — ${this.redactUrlForDisplay(p.databaseUrl)}`;
  }

  private formatScheduler(summary: BootRuntimeSummary): string {
    if (summary.schedulerKind === "local") {
      return "inline (this process)";
    }
    return `BullMQ — queue prefix "${summary.queuePrefix}"`;
  }

  private formatEventBus(summary: BootRuntimeSummary): string {
    if (summary.eventBusKind === "memory") {
      return "in-memory";
    }
    return "Redis";
  }

  private formatRedis(summary: BootRuntimeSummary): string | undefined {
    if (!summary.redisUrl || summary.redisUrl.trim().length === 0) {
      return undefined;
    }
    return this.redactUrlForDisplay(summary.redisUrl);
  }

  private redactUrlForDisplay(raw: string): string {
    try {
      const parsed = new URL(raw);
      if (parsed.password) {
        parsed.password = "***";
      }
      return parsed.toString();
    } catch {
      return "(unparseable URL)";
    }
  }
}

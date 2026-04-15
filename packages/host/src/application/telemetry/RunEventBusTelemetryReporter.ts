import type { RunEvent, RunEventBus, RunEventSubscription } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type {
  RunTraceContextRepository,
  TelemetrySpanStore,
  TelemetrySpanUpsert,
} from "../../domain/telemetry/TelemetryContracts";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { OtelIdentityFactory } from "./OtelIdentityFactory";
import { TelemetryEnricherChain } from "./TelemetryEnricherChain";
import { TelemetryRetentionTimestampFactory } from "./TelemetryRetentionTimestampFactory";

@injectable()
export class RunEventBusTelemetryReporter {
  private subscription: RunEventSubscription | null = null;

  constructor(
    @inject(CoreTokens.RunEventBus)
    private readonly runEventBus: RunEventBus,
    @inject(ApplicationTokens.RunTraceContextRepository)
    private readonly runTraceContextRepository: RunTraceContextRepository,
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
    @inject(ApplicationTokens.TelemetrySpanStore)
    private readonly telemetrySpanStore: TelemetrySpanStore,
    @inject(TelemetryEnricherChain)
    private readonly telemetryEnricherChain: TelemetryEnricherChain,
    @inject(TelemetryRetentionTimestampFactory)
    private readonly telemetryRetentionTimestampFactory: TelemetryRetentionTimestampFactory,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
  ) {}

  async start(): Promise<void> {
    if (this.subscription) {
      return;
    }
    this.subscription = await this.runEventBus.subscribe(async (event) => {
      try {
        await this.handleEvent(event);
      } catch {
        // Telemetry must remain best-effort so workflow execution does not fail on observer persistence races.
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.subscription) {
      return;
    }
    await this.subscription.close();
    this.subscription = null;
  }

  private async handleEvent(event: RunEvent): Promise<void> {
    switch (event.kind) {
      case "runCreated":
        await this.handleRunCreated(event);
        return;
      case "runSaved":
        await this.handleRunSaved(event);
        return;
      case "nodeQueued":
      case "nodeStarted":
      case "nodeCompleted":
      case "nodeFailed":
        await this.handleNodeSnapshot(event);
        return;
    }
  }

  private async handleRunCreated(event: Extract<RunEvent, { kind: "runCreated" }>): Promise<void> {
    const trace = await this.runTraceContextRepository.getOrCreate({
      runId: event.runId,
      workflowId: event.workflowId,
      serviceName: "codemation.workflow",
    });
    const policySnapshot = await this.loadPolicySnapshot(event.runId);
    await this.runTraceContextRepository.upsertExpiry({
      runId: event.runId,
      expiresAt: this.telemetryRetentionTimestampFactory.createTraceContextExpiry(policySnapshot, new Date(event.at)),
    });
    const enrichment = await this.telemetryEnricherChain.enrichRun(event.workflowId);
    await this.telemetrySpanStore.upsert({
      traceId: trace.traceId,
      spanId: trace.rootSpanId,
      runId: event.runId,
      workflowId: event.workflowId,
      name: "workflow.run",
      kind: "internal",
      status: "running",
      startTime: event.at,
      workflowFolder: enrichment.workflowFolder,
      retentionExpiresAt: this.telemetryRetentionTimestampFactory.createSpanExpiry(policySnapshot, new Date(event.at)),
    });
  }

  private async handleRunSaved(event: Extract<RunEvent, { kind: "runSaved" }>): Promise<void> {
    const trace = await this.runTraceContextRepository.getOrCreate({
      runId: event.runId,
      workflowId: event.workflowId,
      serviceName: "codemation.workflow",
    });
    const policySnapshot = await this.loadPolicySnapshot(event.runId);
    const observedAt = new Date(event.state.finishedAt ?? event.at);
    await this.runTraceContextRepository.upsertExpiry({
      runId: event.runId,
      expiresAt: this.telemetryRetentionTimestampFactory.createTraceContextExpiry(policySnapshot, observedAt),
    });
    const enrichment = await this.telemetryEnricherChain.enrichRun(event.workflowId);
    const isTerminal = event.state.status === "completed" || event.state.status === "failed";
    await this.telemetrySpanStore.upsert({
      traceId: trace.traceId,
      spanId: trace.rootSpanId,
      runId: event.runId,
      workflowId: event.workflowId,
      name: "workflow.run",
      kind: "internal",
      status: event.state.status === "failed" ? "failed" : isTerminal ? "completed" : "running",
      startTime: event.state.startedAt,
      endTime: isTerminal ? (event.state.finishedAt ?? event.at) : undefined,
      workflowFolder: enrichment.workflowFolder,
      retentionExpiresAt: this.telemetryRetentionTimestampFactory.createSpanExpiry(policySnapshot, observedAt),
    });
  }

  private async handleNodeSnapshot(
    event: Extract<RunEvent, { kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed" }>,
  ): Promise<void> {
    const trace = await this.runTraceContextRepository.getOrCreate({
      runId: event.runId,
      workflowId: event.workflowId,
      serviceName: "codemation.workflow",
    });
    const policySnapshot = await this.loadPolicySnapshot(event.runId);
    await this.runTraceContextRepository.upsertExpiry({
      runId: event.runId,
      expiresAt: this.telemetryRetentionTimestampFactory.createTraceContextExpiry(policySnapshot, new Date(event.at)),
    });
    const enrichment = await this.telemetryEnricherChain.enrichNode({
      workflowId: event.workflowId,
      nodeId: event.snapshot.nodeId,
    });
    await this.telemetrySpanStore.upsert(
      this.createNodeSpanUpsert(event, trace.traceId, trace.rootSpanId, enrichment, policySnapshot),
    );
  }

  private createNodeSpanUpsert(
    event: Extract<RunEvent, { kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed" }>,
    traceId: string,
    rootSpanId: string,
    enrichment: Readonly<{ workflowFolder?: string; nodeType?: string; nodeRole?: string }>,
    policySnapshot: Awaited<ReturnType<RunEventBusTelemetryReporter["loadPolicySnapshot"]>>,
  ): TelemetrySpanUpsert {
    const snapshot = event.snapshot;
    const status = event.kind === "nodeFailed" ? "failed" : snapshot.finishedAt ? "completed" : "running";
    const observedAt = new Date(snapshot.finishedAt ?? snapshot.startedAt ?? snapshot.queuedAt ?? event.at);
    return {
      traceId,
      spanId: this.otelIdentityFactory.createNodeSpanId(snapshot.activationId ?? snapshot.nodeId),
      parentSpanId: rootSpanId,
      runId: event.runId,
      workflowId: event.workflowId,
      nodeId: snapshot.nodeId,
      activationId: snapshot.activationId,
      name: "workflow.node",
      kind: "internal",
      status,
      statusMessage: snapshot.error?.message,
      startTime: snapshot.startedAt ?? snapshot.queuedAt ?? event.at,
      endTime: snapshot.finishedAt,
      workflowFolder: enrichment.workflowFolder,
      nodeType: enrichment.nodeType,
      nodeRole: enrichment.nodeRole,
      retentionExpiresAt: this.telemetryRetentionTimestampFactory.createSpanExpiry(policySnapshot, observedAt),
      attributes: {
        usedPinnedOutput: snapshot.usedPinnedOutput ?? undefined,
      },
    };
  }

  private async loadPolicySnapshot(runId: string) {
    const state = await this.workflowRunRepository.load(runId);
    return state?.policySnapshot;
  }
}

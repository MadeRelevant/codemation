import type {
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryAttributes,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
} from "@codemation/core";
import { NoOpTelemetryArtifactReference } from "@codemation/core";
import type { TelemetrySpanUpsert } from "../../domain/telemetry/TelemetryContracts";
import type { StoredSpanScopeArgs } from "./OtelExecutionTelemetry.types";

export class StoredTelemetrySpanScope implements TelemetrySpanScope {
  readonly traceId: string;
  readonly spanId: string;

  protected readonly deps: StoredSpanScopeArgs;
  protected readonly nodeId: string | undefined;
  protected readonly activationId: string | undefined;
  private readonly parentSpanId: string | undefined;
  private readonly spanName: string;
  private readonly spanKind: "internal" | "client";
  private readonly initialAttributes: TelemetryAttributes | undefined;
  private readonly initialStartTime: Date | undefined;
  private readonly connectionInvocationId: string | undefined;
  private readonly modelName: string | undefined;

  constructor(args: StoredSpanScopeArgs) {
    this.deps = args;
    this.traceId = args.traceId;
    this.spanId = args.spanId;
    this.parentSpanId = args.parentSpanId;
    this.nodeId = args.nodeId;
    this.activationId = args.activationId;
    this.spanName = args.spanName;
    this.spanKind = args.spanKind;
    this.initialAttributes = args.initialAttributes;
    this.initialStartTime = args.initialStartTime;
    this.connectionInvocationId = args.connectionInvocationId;
    this.modelName = args.modelName;
  }

  async addSpanEvent(args: TelemetrySpanEventRecord): Promise<void> {
    await this.upsert({
      events: [args],
    });
  }

  async recordMetric(args: TelemetryMetricRecord): Promise<void> {
    const enrichment = await this.resolveEnrichment();
    const observedAt = new Date();
    await this.deps.telemetryMetricPointStore.save({
      traceId: this.traceId,
      spanId: this.spanId,
      runId: this.deps.runId,
      workflowId: this.deps.workflowId,
      nodeId: this.nodeId,
      activationId: this.activationId,
      name: args.name,
      value: args.value,
      unit: args.unit,
      attributes: args.attributes,
      observedAt: observedAt.toISOString(),
      workflowFolder: enrichment.workflowFolder,
      nodeType: enrichment.nodeType,
      nodeRole: enrichment.nodeRole,
      modelName: this.modelName,
      retentionExpiresAt: this.deps.telemetryRetentionTimestampFactory.createMetricExpiry(
        this.deps.policySnapshot,
        observedAt,
      ),
    });
    await this.touchTraceContextExpiry(
      this.deps.telemetryRetentionTimestampFactory.createTraceContextExpiry(this.deps.policySnapshot, observedAt),
    );
  }

  async attachArtifact(args: TelemetryArtifactAttachment): Promise<TelemetryArtifactReference> {
    if (!this.deps.telemetryPrivacyPolicy.shouldCaptureArtifact(args)) {
      return NoOpTelemetryArtifactReference.value;
    }
    const observedAt = new Date();
    const artifact = await this.deps.telemetryArtifactStore.save({
      traceId: this.traceId,
      spanId: this.spanId,
      runId: this.deps.runId,
      workflowId: this.deps.workflowId,
      nodeId: this.nodeId,
      activationId: this.activationId,
      kind: args.kind,
      contentType: args.contentType,
      previewText: this.deps.telemetryPrivacyPolicy.trimPreviewText(args.previewText),
      previewJson: args.previewJson,
      payloadText: args.payloadText,
      payloadJson: args.payloadJson,
      bytes: args.bytes,
      truncated: args.truncated,
      expiresAt: args.expiresAt,
      retentionExpiresAt: this.deps.telemetryRetentionTimestampFactory.createArtifactExpiry(
        this.deps.policySnapshot,
        observedAt,
      ),
    });
    await this.touchTraceContextExpiry(
      this.deps.telemetryRetentionTimestampFactory.createTraceContextExpiry(this.deps.policySnapshot, observedAt),
    );
    return {
      artifactId: artifact.artifactId,
      traceId: artifact.traceId,
      spanId: artifact.spanId,
    };
  }

  async end(args: TelemetrySpanEnd = {}): Promise<void> {
    await this.upsert({
      status: args.status === "error" ? "failed" : "completed",
      statusMessage: args.statusMessage,
      endTime: (args.endedAt ?? new Date()).toISOString(),
      attributes: args.attributes,
    });
  }

  async markStarted(): Promise<void> {
    await this.upsert({
      status: "running",
      startTime: (this.initialStartTime ?? new Date()).toISOString(),
      attributes: this.initialAttributes,
      modelName: this.modelName,
      connectionInvocationId: this.connectionInvocationId,
    });
  }

  protected async upsert(update: Partial<TelemetrySpanUpsert>): Promise<void> {
    const enrichment = await this.resolveEnrichment();
    const observedAt = this.resolveObservedAt(update);
    const retentionExpiresAt =
      update.retentionExpiresAt ??
      this.deps.telemetryRetentionTimestampFactory.createSpanExpiry(this.deps.policySnapshot, observedAt);
    await this.deps.telemetrySpanStore.upsert({
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      runId: this.deps.runId,
      workflowId: this.deps.workflowId,
      nodeId: this.nodeId,
      activationId: this.activationId,
      name: this.spanName,
      kind: this.spanKind,
      workflowFolder: enrichment.workflowFolder,
      nodeType: enrichment.nodeType,
      nodeRole: enrichment.nodeRole,
      retentionExpiresAt,
      ...update,
    });
    await this.touchTraceContextExpiry(
      this.deps.telemetryRetentionTimestampFactory.createTraceContextExpiry(this.deps.policySnapshot, observedAt),
    );
  }

  private async resolveEnrichment(): Promise<
    Readonly<{ workflowFolder?: string; nodeType?: string; nodeRole?: string }>
  > {
    if (this.nodeId) {
      return await this.deps.telemetryEnricherChain.enrichNode({
        workflowId: this.deps.workflowId,
        nodeId: this.nodeId,
      });
    }
    return await this.deps.telemetryEnricherChain.enrichRun(this.deps.workflowId);
  }

  private resolveObservedAt(update: Partial<TelemetrySpanUpsert>): Date {
    const iso = update.endTime ?? update.startTime;
    return iso ? new Date(iso) : new Date();
  }

  private async touchTraceContextExpiry(expiresAt: string | undefined): Promise<void> {
    await this.deps.runTraceContextRepository.upsertExpiry({
      runId: this.deps.runId,
      expiresAt,
    });
  }

  protected toStringAttribute(value: TelemetryAttributes[string]): string | undefined {
    return typeof value === "string" ? value : undefined;
  }
}

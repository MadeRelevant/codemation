import type {
  NodeActivationId,
  NodeExecutionTelemetry,
  NodeId,
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
  protected readonly iterationId: string | undefined;
  protected readonly itemIndex: number | undefined;
  protected readonly parentInvocationId: string | undefined;

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
    this.iterationId = args.iterationId;
    this.itemIndex = args.itemIndex;
    this.parentInvocationId = args.parentInvocationId;
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
      iterationId: this.iterationId,
      itemIndex: this.itemIndex,
      parentInvocationId: this.parentInvocationId,
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

  asNodeTelemetry(args: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry {
    return this.buildNodeTelemetryView(args);
  }

  private buildNodeTelemetryView(
    args: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>,
  ): NodeExecutionTelemetry {
    // Returns a NodeExecutionTelemetry view of THIS span: children created via the returned
    // telemetry's `startChildSpan` parent under this span (e.g. agent.tool.call) and inherit the
    // child execution scope's nodeId/activationId. Used at the sub-agent boundary so nested
    // runtime telemetry parents under the tool-call span instead of the orchestrator's node span.
    const buildChildScope = (
      childName: string,
      childKind: "internal" | "client",
      childAttrs?: TelemetryAttributes,
      childStart?: Date,
    ): StoredTelemetrySpanScope => {
      // eslint-disable-next-line codemation/no-manual-di-new
      const child = new StoredTelemetrySpanScope({
        ...this.deps,
        spanId: this.deps.otelIdentityFactory.createEphemeralSpanId(),
        parentSpanId: this.spanId,
        nodeId: args.nodeId,
        activationId: args.activationId,
        spanName: childName,
        spanKind: childKind,
        initialAttributes: childAttrs,
        initialStartTime: childStart,
        connectionInvocationId: this.toStringAttribute(
          childAttrs?.["codemation.connection.invocation_id"] ?? childAttrs?.["connection.invocation_id"],
        ),
        modelName: this.toStringAttribute(childAttrs?.["gen_ai.request.model"]),
        iterationId: this.iterationId,
        itemIndex: this.itemIndex,
        parentInvocationId: this.parentInvocationId,
      });
      void child.markStarted();
      return child;
    };
    const view: NodeExecutionTelemetry = {
      traceId: this.traceId,
      spanId: this.spanId,
      addSpanEvent: (event) => this.addSpanEvent(event),
      recordMetric: (metric) => this.recordMetric(metric),
      attachArtifact: (artifact) => this.attachArtifact(artifact),
      end: (endArgs) => this.end(endArgs),
      asNodeTelemetry: (rescope) => this.asNodeTelemetry(rescope),
      forNode: () => view,
      startChildSpan: (childArgs) =>
        buildChildScope(childArgs.name, childArgs.kind ?? "internal", childArgs.attributes, childArgs.startedAt),
    };
    return view;
  }

  async markStarted(): Promise<void> {
    await this.upsert({
      status: "running",
      startTime: (this.initialStartTime ?? new Date()).toISOString(),
      attributes: this.attributesWithIdentity(this.initialAttributes),
      modelName: this.modelName,
      connectionInvocationId: this.connectionInvocationId,
      iterationId: this.iterationId,
      itemIndex: this.itemIndex,
      parentInvocationId: this.parentInvocationId,
    });
  }

  /**
   * Stamps `codemation.iteration.id`, `codemation.iteration.index`, and
   * `codemation.parent.invocation_id` onto the attribute bag so dashboards/queries can filter by
   * iteration without joining on the dedicated columns. The dedicated columns are still the
   * authoritative source — these attributes are convenience for downstream consumers.
   */
  protected attributesWithIdentity(attrs: TelemetryAttributes | undefined): TelemetryAttributes | undefined {
    const base: Record<string, TelemetryAttributes[string]> = { ...(attrs ?? {}) };
    if (typeof this.iterationId === "string" && this.iterationId.length > 0) {
      base["codemation.iteration.id"] = this.iterationId;
    }
    if (typeof this.itemIndex === "number") {
      base["codemation.iteration.index"] = this.itemIndex;
    }
    if (typeof this.parentInvocationId === "string" && this.parentInvocationId.length > 0) {
      base["codemation.parent.invocation_id"] = this.parentInvocationId;
    }
    return Object.keys(base).length > 0 ? base : undefined;
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

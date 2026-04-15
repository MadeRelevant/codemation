import type {
  ExecutionTelemetry,
  NodeExecutionTelemetry,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryMetricRecord,
  TelemetrySpanEventRecord,
} from "@codemation/core";
import { StoredNodeExecutionTelemetry } from "./StoredNodeExecutionTelemetry";
import { StoredTelemetrySpanScope } from "./StoredTelemetrySpanScope";
import type { StoredExecutionTelemetryDeps } from "./OtelExecutionTelemetry.types";

export class StoredExecutionTelemetry implements ExecutionTelemetry {
  readonly traceId: string;
  readonly spanId: string;

  constructor(private readonly deps: StoredExecutionTelemetryDeps) {
    this.traceId = deps.traceId;
    this.spanId = deps.rootSpanId;
  }

  async addSpanEvent(args: TelemetrySpanEventRecord): Promise<void> {
    await this.createRunScope().addSpanEvent(args);
  }

  async recordMetric(args: TelemetryMetricRecord): Promise<void> {
    await this.createRunScope().recordMetric(args);
  }

  async attachArtifact(args: TelemetryArtifactAttachment): Promise<TelemetryArtifactReference> {
    return await this.createRunScope().attachArtifact(args);
  }

  forNode(args: Readonly<{ nodeId: string; activationId: string }>): NodeExecutionTelemetry {
    // eslint-disable-next-line codemation/no-manual-di-new
    return new StoredNodeExecutionTelemetry({
      ...this.deps,
      spanId: this.deps.otelIdentityFactory.createNodeSpanId(args.activationId),
      parentSpanId: this.deps.rootSpanId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      spanName: "workflow.node",
      spanKind: "internal",
    });
  }

  private createRunScope(): StoredTelemetrySpanScope {
    // eslint-disable-next-line codemation/no-manual-di-new
    return new StoredTelemetrySpanScope({
      ...this.deps,
      spanId: this.deps.rootSpanId,
      spanName: "workflow.run",
      spanKind: "internal",
    });
  }
}

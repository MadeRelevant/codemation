import type { NodeActivationId, NodeId } from "./workflowTypes";
import type {
  NodeExecutionTelemetry,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
} from "./telemetryTypes";
import { NoOpTelemetryArtifactReference } from "./NoOpTelemetryArtifactReference";

/**
 * Standalone no-op {@link NodeExecutionTelemetry} value used as the return for `asNodeTelemetry`.
 *
 * Defined here (instead of in `NoOpNodeExecutionTelemetry.ts`) so that {@link NoOpTelemetrySpanScope}
 * can return it without importing the other module — both no-ops share this leaf.
 */
const noOpNodeExecutionTelemetry: NodeExecutionTelemetry = {
  traceId: "00000000000000000000000000000000",
  spanId: "0000000000000000",
  addSpanEvent(_: TelemetrySpanEventRecord): void {},
  recordMetric(_: TelemetryMetricRecord): void {},
  attachArtifact(_: TelemetryArtifactAttachment): TelemetryArtifactReference {
    return NoOpTelemetryArtifactReference.value;
  },
  end(_: TelemetrySpanEnd = {}): void {},
  asNodeTelemetry(_: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry {
    return noOpNodeExecutionTelemetry;
  },
  forNode(_: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry {
    return noOpNodeExecutionTelemetry;
  },
  startChildSpan(_: TelemetryChildSpanStart): TelemetrySpanScope {
    return noOpTelemetrySpanScope;
  },
};

const noOpTelemetrySpanScope: TelemetrySpanScope = {
  traceId: "00000000000000000000000000000000",
  spanId: "0000000000000000",
  addSpanEvent(_: TelemetrySpanEventRecord): void {},
  recordMetric(_: TelemetryMetricRecord): void {},
  attachArtifact(_: TelemetryArtifactAttachment): TelemetryArtifactReference {
    return NoOpTelemetryArtifactReference.value;
  },
  end(_: TelemetrySpanEnd = {}): void {},
  asNodeTelemetry(_: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry {
    return noOpNodeExecutionTelemetry;
  },
};

export class NoOpTelemetrySpanScope {
  static readonly value: TelemetrySpanScope = noOpTelemetrySpanScope;
  /** Internal: the shared no-op {@link NodeExecutionTelemetry} that {@link NoOpNodeExecutionTelemetry} re-exposes. */
  static readonly nodeExecutionTelemetryValue: NodeExecutionTelemetry = noOpNodeExecutionTelemetry;
}

import type {
  ExecutionTelemetry,
  NodeExecutionTelemetry,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryMetricRecord,
  TelemetrySpanEventRecord,
} from "./telemetryTypes";
import type { NodeActivationId, NodeId } from "./workflowTypes";
import { NoOpNodeExecutionTelemetry } from "./NoOpNodeExecutionTelemetry";
import { NoOpTelemetryArtifactReference } from "./NoOpTelemetryArtifactReference";

export class NoOpExecutionTelemetry {
  static readonly value: ExecutionTelemetry = {
    traceId: "00000000000000000000000000000000",
    spanId: "0000000000000000",
    addSpanEvent(_: TelemetrySpanEventRecord): void {},
    recordMetric(_: TelemetryMetricRecord): void {},
    attachArtifact(_: TelemetryArtifactAttachment): TelemetryArtifactReference {
      return NoOpTelemetryArtifactReference.value;
    },
    forNode(_: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry {
      return NoOpNodeExecutionTelemetry.value;
    },
  };
}

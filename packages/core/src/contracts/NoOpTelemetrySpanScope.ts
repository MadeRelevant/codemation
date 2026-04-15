import type {
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
} from "./telemetryTypes";
import { NoOpTelemetryArtifactReference } from "./NoOpTelemetryArtifactReference";

export class NoOpTelemetrySpanScope {
  static readonly value: TelemetrySpanScope = {
    traceId: "00000000000000000000000000000000",
    spanId: "0000000000000000",
    addSpanEvent(_: TelemetrySpanEventRecord): void {},
    recordMetric(_: TelemetryMetricRecord): void {},
    attachArtifact(_: TelemetryArtifactAttachment): TelemetryArtifactReference {
      return NoOpTelemetryArtifactReference.value;
    },
    end(_: TelemetrySpanEnd = {}): void {},
  };
}

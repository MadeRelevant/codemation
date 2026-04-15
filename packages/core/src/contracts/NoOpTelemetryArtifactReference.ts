import type { TelemetryArtifactReference } from "./telemetryTypes";

export class NoOpTelemetryArtifactReference {
  static readonly value: TelemetryArtifactReference = {
    artifactId: "telemetry-artifact-noop",
    traceId: undefined,
    spanId: undefined,
  };
}

import type {
  TelemetryArtifactRecord,
  TelemetryMetricPointRecord,
  TelemetrySpanRecord,
} from "../../domain/telemetry/TelemetryContracts";

export interface TelemetryRunTraceViewDto {
  readonly traceId: string;
  readonly runId: string;
  readonly spans: ReadonlyArray<TelemetrySpanRecord>;
  readonly artifacts: ReadonlyArray<TelemetryArtifactRecord>;
  readonly metricPoints: ReadonlyArray<TelemetryMetricPointRecord>;
}

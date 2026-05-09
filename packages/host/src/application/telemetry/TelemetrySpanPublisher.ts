import type { TelemetrySpanUpsert } from "../../domain/telemetry/TelemetryContracts";

export interface TelemetrySpanPublisher {
  publishSpan(span: TelemetrySpanUpsert): Promise<void>;
}

export const NoOpTelemetrySpanPublisher: TelemetrySpanPublisher = {
  async publishSpan(_span: TelemetrySpanUpsert): Promise<void> {
    // No-op: used in tests and when websocket relay is not wired in.
  },
};

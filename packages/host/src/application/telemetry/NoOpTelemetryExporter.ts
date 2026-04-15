import { injectable } from "@codemation/core";
import type { TelemetryExporter, TelemetrySpanRecord } from "../../domain/telemetry/TelemetryContracts";

@injectable()
export class NoOpTelemetryExporter implements TelemetryExporter {
  async exportSpans(_: ReadonlyArray<TelemetrySpanRecord>): Promise<void> {}
}

import { injectable } from "@codemation/core";
import type { TelemetryExporter, TelemetrySpanRecord } from "../../domain/telemetry/TelemetryContracts";

@injectable()
export class CompositeTelemetryExporter implements TelemetryExporter {
  constructor(private readonly exporters: ReadonlyArray<TelemetryExporter>) {}

  async exportSpans(spans: ReadonlyArray<TelemetrySpanRecord>): Promise<void> {
    for (const exporter of this.exporters) {
      await exporter.exportSpans(spans);
    }
  }
}

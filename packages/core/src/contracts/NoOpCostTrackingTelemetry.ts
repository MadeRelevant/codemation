import type {
  CostTrackingPriceQuote,
  CostTrackingTelemetry,
  CostTrackingUsageRecord,
} from "./CostTrackingTelemetryContract";
import type { TelemetryScope } from "./telemetryTypes";

export class NoOpCostTrackingTelemetry implements CostTrackingTelemetry {
  async captureUsage(_: CostTrackingUsageRecord): Promise<CostTrackingPriceQuote | undefined> {
    return undefined;
  }

  forScope(_: TelemetryScope): CostTrackingTelemetry {
    return this;
  }
}

import type { CostTrackingTelemetry, CostTrackingTelemetryFactory } from "./CostTrackingTelemetryContract";
import type { ExecutionTelemetry } from "./telemetryTypes";
import { NoOpCostTrackingTelemetry } from "./NoOpCostTrackingTelemetry";

export class NoOpCostTrackingTelemetryFactory implements CostTrackingTelemetryFactory {
  create(_: Readonly<{ telemetry: ExecutionTelemetry }>): CostTrackingTelemetry {
    return new NoOpCostTrackingTelemetry();
  }
}

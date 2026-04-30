import type { NodeExecutionTelemetry } from "./telemetryTypes";
import { NoOpTelemetrySpanScope } from "./NoOpTelemetrySpanScope";

export class NoOpNodeExecutionTelemetry {
  static readonly value: NodeExecutionTelemetry = NoOpTelemetrySpanScope.nodeExecutionTelemetryValue;
}

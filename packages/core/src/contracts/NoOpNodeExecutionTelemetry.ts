import type { NodeActivationId, NodeId } from "./workflowTypes";
import type { NodeExecutionTelemetry, TelemetryChildSpanStart, TelemetrySpanScope } from "./telemetryTypes";
import { NoOpTelemetrySpanScope } from "./NoOpTelemetrySpanScope";

export class NoOpNodeExecutionTelemetry {
  static readonly value: NodeExecutionTelemetry = {
    ...NoOpTelemetrySpanScope.value,
    forNode(_: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry {
      return NoOpNodeExecutionTelemetry.value;
    },
    startChildSpan(_: TelemetryChildSpanStart): TelemetrySpanScope {
      return NoOpTelemetrySpanScope.value;
    },
  };
}

import type { ParentExecutionRef, PersistedRunPolicySnapshot, RunId, WorkflowId } from "./workflowTypes";
import type { ExecutionTelemetry, ExecutionTelemetryFactory } from "./telemetryTypes";
import { NoOpExecutionTelemetry } from "./NoOpExecutionTelemetry";

export class NoOpExecutionTelemetryFactory implements ExecutionTelemetryFactory {
  create(
    _: Readonly<{
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      policySnapshot?: PersistedRunPolicySnapshot;
    }>,
  ): ExecutionTelemetry {
    return NoOpExecutionTelemetry.value;
  }
}

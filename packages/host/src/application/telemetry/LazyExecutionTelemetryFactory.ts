import type {
  ExecutionTelemetry,
  ExecutionTelemetryFactory,
  ParentExecutionRef,
  PersistedRunPolicySnapshot,
} from "@codemation/core";

export class LazyExecutionTelemetryFactory implements ExecutionTelemetryFactory {
  constructor(private readonly resolveFactory: () => ExecutionTelemetryFactory) {}

  create(
    args: Readonly<{
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      policySnapshot?: PersistedRunPolicySnapshot;
    }>,
  ): ExecutionTelemetry {
    return this.resolveFactory().create(args);
  }
}

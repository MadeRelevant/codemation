import type { NodeDefinition, RetryPolicySpec, WorkflowDefinition } from "@codemation/core";

/** UI-facing policy labels derived from workflow/node definitions (live or hydrated snapshot). */
export class WorkflowPolicyUiPresentationFactory {
  workflowHasErrorHandler(workflow: WorkflowDefinition): boolean {
    return workflow.workflowErrorHandler !== undefined;
  }

  nodeRetrySummary(config: NodeDefinition["config"]): string | undefined {
    const spec = config.retryPolicy as RetryPolicySpec | undefined;
    if (!spec) return undefined;
    if (spec.kind === "none") return "Retry: off";
    if (spec.kind === "fixed") return `Retry: ${spec.maxAttempts}x @ ${spec.delayMs}ms`;
    if (spec.kind === "exponential") {
      const jitter = spec.jitter ? ", jitter" : "";
      return `Retry: exp ${spec.maxAttempts}x from ${spec.initialDelayMs}ms (x${spec.multiplier}${jitter})`;
    }
    return undefined;
  }

  nodeHasErrorHandler(config: NodeDefinition["config"]): boolean {
    return config.nodeErrorHandler !== undefined;
  }

  snapshotNodeRetrySummary(config: unknown): string | undefined {
    const record = this.asRecord(config);
    const spec = record.retryPolicy as RetryPolicySpec | undefined;
    if (!spec || typeof spec !== "object") return undefined;
    return this.nodeRetrySummary({ retryPolicy: spec } as NodeDefinition["config"]);
  }

  snapshotNodeHasErrorHandler(config: unknown): boolean {
    return this.asRecord(config).nodeErrorHandler !== undefined;
  }

  private asRecord(value: unknown): Readonly<Record<string, unknown>> {
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }
}

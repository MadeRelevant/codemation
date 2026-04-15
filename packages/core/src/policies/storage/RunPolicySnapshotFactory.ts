import type {
  PersistedRunPolicySnapshot,
  WorkflowDefinition,
  WorkflowPolicyRuntimeDefaults,
  WorkflowStoragePolicyMode,
} from "../../types";

export class RunPolicySnapshotFactory {
  static create(workflow: WorkflowDefinition, defaults?: WorkflowPolicyRuntimeDefaults): PersistedRunPolicySnapshot {
    const prune = workflow.prunePolicy;
    const retentionSeconds = prune?.runDataRetentionSeconds ?? defaults?.retentionSeconds;
    const binaryRetentionSeconds = prune?.binaryRetentionSeconds ?? defaults?.binaryRetentionSeconds;
    const telemetrySpanRetentionSeconds =
      prune?.telemetrySpanRetentionSeconds ?? defaults?.telemetrySpanRetentionSeconds;
    const telemetryArtifactRetentionSeconds =
      prune?.telemetryArtifactRetentionSeconds ?? defaults?.telemetryArtifactRetentionSeconds;
    const telemetryMetricRetentionSeconds =
      prune?.telemetryMetricRetentionSeconds ?? defaults?.telemetryMetricRetentionSeconds;
    const storagePolicy: WorkflowStoragePolicyMode =
      typeof workflow.storagePolicy === "string"
        ? (workflow.storagePolicy as WorkflowStoragePolicyMode)
        : (defaults?.storagePolicy ?? "ALL");
    return {
      retentionSeconds,
      binaryRetentionSeconds,
      telemetrySpanRetentionSeconds,
      telemetryArtifactRetentionSeconds,
      telemetryMetricRetentionSeconds,
      storagePolicy,
    };
  }
}

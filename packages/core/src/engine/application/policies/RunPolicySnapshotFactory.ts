import type {
  PersistedRunPolicySnapshot,
  WorkflowDefinition,
  WorkflowPolicyRuntimeDefaults,
  WorkflowStoragePolicyMode,
} from "../../../types";

export class RunPolicySnapshotFactory {
  create(workflow: WorkflowDefinition, defaults?: WorkflowPolicyRuntimeDefaults): PersistedRunPolicySnapshot {
    const prune = workflow.prunePolicy;
    const retentionSeconds = prune?.runDataRetentionSeconds ?? defaults?.retentionSeconds;
    const binaryRetentionSeconds = prune?.binaryRetentionSeconds ?? defaults?.binaryRetentionSeconds;
    const storagePolicy: WorkflowStoragePolicyMode =
      typeof workflow.storagePolicy === "string" ? (workflow.storagePolicy as WorkflowStoragePolicyMode) : defaults?.storagePolicy ?? "ALL";
    return {
      retentionSeconds,
      binaryRetentionSeconds,
      storagePolicy,
    };
  }
}

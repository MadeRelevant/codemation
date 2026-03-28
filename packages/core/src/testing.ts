/**
 * Test-only adapters and helpers. Not part of the supported production public API.
 */
export { InMemoryLiveWorkflowRepository } from "./runtime/InMemoryLiveWorkflowRepository";
export { WorkflowSnapshotCodec as PersistedWorkflowSnapshotFactory } from "./workflowSnapshots/WorkflowSnapshotCodec";
export { RejectingCredentialSessionService } from "./testing/RejectingCredentialSessionService";

/**
 * Minimal base types that have no dependencies on other contracts.
 * Used by credentialTypes, workflowTypes, and other contract layers
 * to avoid circular dependencies.
 */

export type WorkflowId = string;
export type NodeId = string;
export type OutputPortKey = string;
export type InputPortKey = string;
export type PersistedTokenId = string;
export type NodeConnectionName = string;

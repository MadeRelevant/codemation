import type { ConnectionInvocationRecord } from "../contracts/runTypes";
import type { NodeExecutionSnapshot, ParentExecutionRef, PersistedRunState, RunId, WorkflowId } from "../types";

export type RunEvent =
  | Readonly<{ kind: "runCreated"; runId: RunId; workflowId: WorkflowId; parent?: ParentExecutionRef; at: string }>
  | Readonly<{
      kind: "runSaved";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      state: PersistedRunState;
    }>
  | Readonly<{
      kind: "nodeQueued";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeStarted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeCompleted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeFailed";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "connectionInvocationStarted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>
  | Readonly<{
      kind: "connectionInvocationCompleted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>
  | Readonly<{
      kind: "connectionInvocationFailed";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>;

export interface RunEventSubscription {
  close(): Promise<void>;
}

export interface RunEventBus {
  publish(event: RunEvent): Promise<void>;
  subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription>;
  subscribeToWorkflow(workflowId: WorkflowId, onEvent: (event: RunEvent) => void): Promise<RunEventSubscription>;
}

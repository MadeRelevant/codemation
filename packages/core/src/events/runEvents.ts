import type { PersistedRunState, RunId, WorkflowId } from "../types";

export type RunEvent =
  | Readonly<{ kind: "runCreated"; runId: RunId; workflowId: WorkflowId; at: string }>
  | Readonly<{ kind: "runSaved"; runId: RunId; workflowId: WorkflowId; at: string; state: PersistedRunState }>;

export interface RunEventSubscription {
  close(): Promise<void>;
}

export interface RunEventBus {
  publish(event: RunEvent): Promise<void>;
  subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription>;
}


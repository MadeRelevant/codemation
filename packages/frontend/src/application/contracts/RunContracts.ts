import type { Items, PersistedMutableRunState, PersistedRunState, RunCurrentState } from "@codemation/core";

export type CreateRunRequest = Readonly<{
  workflowId?: string;
  items?: Items;
  currentState?: RunCurrentState;
  startAt?: string;
  stopAt?: string;
  clearFromNodeId?: string;
  mode?: "manual" | "debug";
  sourceRunId?: string;
}>;

export type UpdateRunWorkflowSnapshotRequest = Readonly<{
  workflowSnapshot?: PersistedRunState["workflowSnapshot"];
}>;

export type UpdateRunNodePinRequest = Readonly<{
  items?: Items;
}>;

export type RunNodeRequest = Readonly<{
  items?: Items;
  mode?: "manual" | "debug";
}>;

export type RunCommandResult = Readonly<{
  runId: string;
  workflowId: string;
  startedAt?: string;
  status: string;
  state: PersistedRunState | null;
}>;

export type MutableRunNodeInputState = Readonly<{
  state: PersistedRunState;
  mutableState: PersistedMutableRunState;
  nodeId: string;
}>;

import type { TypeToken } from "../di";
import type { RunEventBus } from "../events/runEvents";
import type {
Edge,
InputPortKey,
Items,
NodeActivationId,
NodeId,
NodeKind,
NodeOutputs,
OutputPortKey,
ParentExecutionRef,
PersistedTokenId,
RunId,
WorkflowDefinition,
WorkflowId,
} from "./workflowTypes";

export interface RunExecutionOptions {
  localOnly?: boolean;
  webhook?: boolean;
  mode?: "manual" | "debug";
  sourceWorkflowId?: WorkflowId;
  sourceRunId?: RunId;
  derivedFromRunId?: RunId;
  isMutable?: boolean;
}

export type RunStopCondition =
  | Readonly<{
      kind: "workflowCompleted";
    }>
  | Readonly<{
      kind: "nodeCompleted";
      nodeId: NodeId;
    }>;

export interface RunStateResetRequest {
  clearFromNodeId: NodeId;
}

export interface PersistedRunControlState {
  stopCondition?: RunStopCondition;
}

export interface PersistedWorkflowSnapshotNode {
  id: NodeId;
  kind: NodeKind;
  name?: string;
  nodeTokenId: PersistedTokenId;
  configTokenId: PersistedTokenId;
  tokenName?: string;
  configTokenName?: string;
  config: unknown;
}

export interface PersistedWorkflowSnapshot {
  id: WorkflowId;
  name: string;
  nodes: ReadonlyArray<PersistedWorkflowSnapshotNode>;
  edges: ReadonlyArray<Edge>;
}

export type PinnedNodeOutputsByPort = Readonly<Record<OutputPortKey, Items>>;

export interface PersistedMutableNodeState {
  pinnedOutputsByPort?: PinnedNodeOutputsByPort;
  lastDebugInput?: Items;
}

export interface PersistedMutableRunState {
  nodesById: Readonly<Record<NodeId, PersistedMutableNodeState>>;
}

export type NodeInputsByPort = Readonly<Record<InputPortKey, Items>>;

export interface RunQueueEntry {
  nodeId: NodeId;
  input: Items;
  toInput?: InputPortKey;
  batchId?: string;
  from?: Readonly<{ nodeId: NodeId; output: OutputPortKey }>;
  collect?: Readonly<{
    expectedInputs: ReadonlyArray<InputPortKey>;
    received: Readonly<Record<InputPortKey, Items>>;
  }>;
}

export type NodeExecutionStatus = "pending" | "queued" | "running" | "completed" | "failed" | "skipped";

export interface NodeExecutionError {
  message: string;
  name?: string;
  stack?: string;
}

export interface NodeExecutionSnapshot {
  runId: RunId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  activationId?: NodeActivationId;
  parent?: ParentExecutionRef;
  status: NodeExecutionStatus;
  usedPinnedOutput?: boolean;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  inputsByPort?: NodeInputsByPort;
  outputs?: NodeOutputs;
  error?: NodeExecutionError;
}

export interface RunCurrentState {
  outputsByNode: Record<NodeId, NodeOutputs>;
  nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
  mutableState?: PersistedMutableRunState;
}

export interface CurrentStateExecutionRequest {
  workflow: WorkflowDefinition;
  items?: Items;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
  workflowSnapshot?: PersistedWorkflowSnapshot;
  mutableState?: PersistedMutableRunState;
  currentState?: RunCurrentState;
  stopCondition?: RunStopCondition;
  reset?: RunStateResetRequest;
}

export interface ExecutionFrontierPlan {
  rootNodeId?: NodeId;
  rootNodeInput?: Items;
  queue: RunQueueEntry[];
  currentState: RunCurrentState;
  stopCondition: RunStopCondition;
  satisfiedNodeIds: ReadonlyArray<NodeId>;
  skippedNodeIds: ReadonlyArray<NodeId>;
  clearedNodeIds: ReadonlyArray<NodeId>;
  preservedPinnedNodeIds: ReadonlyArray<NodeId>;
}

export type RunStatus = "running" | "pending" | "completed" | "failed";

export interface RunSummary {
  runId: RunId;
  workflowId: WorkflowId;
  startedAt: string;
  status: RunStatus;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
}

export interface PendingNodeExecution {
  runId: RunId;
  activationId: NodeActivationId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  itemsIn: number;
  inputsByPort: NodeInputsByPort;
  receiptId: string;
  queue?: string;
  batchId?: string;
  enqueuedAt: string;
}

export interface PersistedRunState {
  runId: RunId;
  workflowId: WorkflowId;
  startedAt: string;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
  control?: PersistedRunControlState;
  workflowSnapshot?: PersistedWorkflowSnapshot;
  mutableState?: PersistedMutableRunState;
  status: RunStatus;
  pending?: PendingNodeExecution;
  queue: RunQueueEntry[];
  outputsByNode: Record<NodeId, NodeOutputs>;
  nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
}

export interface RunStateStore {
  createRun(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    control?: PersistedRunControlState;
    workflowSnapshot?: PersistedWorkflowSnapshot;
    mutableState?: PersistedMutableRunState;
  }): Promise<void>;
  load(runId: RunId): Promise<PersistedRunState | undefined>;
  save(state: PersistedRunState): Promise<void>;
}

export interface RunListingStore {
  listRuns(args?: Readonly<{ workflowId?: WorkflowId; limit?: number }>): Promise<ReadonlyArray<RunSummary>>;
}

export type RunResult =
  | { runId: RunId; workflowId: WorkflowId; startedAt: string; status: "completed"; outputs: Items }
  | { runId: RunId; workflowId: WorkflowId; startedAt: string; status: "pending"; pending: PendingNodeExecution }
  | { runId: RunId; workflowId: WorkflowId; startedAt: string; status: "failed"; error: { message: string } };

export type WebhookRunResult = Readonly<{
  runId: RunId;
  workflowId: WorkflowId;
  startedAt: string;
  runStatus: "pending" | "completed";
  response: Items;
}>;

export interface PersistedWorkflowTokenRegistryLike {
  register(type: TypeToken<unknown>, packageId: string, persistedNameOverride?: string): string;
  getTokenId(type: TypeToken<unknown>): string | undefined;
  resolve(tokenId: string): TypeToken<unknown> | undefined;
  registerFromWorkflows?(workflows: ReadonlyArray<WorkflowDefinition>): void;
}

export interface RunCompletionNotifier {
  resolveRunCompletion(result: RunResult): void;
  resolveWebhookResponse(result: WebhookRunResult): void;
}

export interface RunEventPublisherDeps {
  eventBus?: RunEventBus;
}

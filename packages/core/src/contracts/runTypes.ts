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
PersistedRunPolicySnapshot,
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
  /** Set by the engine for this run: 0 = root, 1 = first child subworkflow, … */
  subworkflowDepth?: number;
  /** Effective cap after engine policy merge (successful node completions per run). */
  maxNodeActivations?: number;
  /** Effective cap after engine policy merge (subworkflow nesting). */
  maxSubworkflowDepth?: number;
}

/** Engine-owned counters persisted with the run (worker-safe). */
export interface EngineRunCounters {
  completedNodeActivations: number;
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
  /** When the snapshot was built from a live workflow definition that configured a workflow error handler. */
  workflowErrorHandlerConfigured?: boolean;
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
  /** ISO timestamp when the run finished (derived from node snapshots or store `updatedAt`); omit while running/pending. */
  finishedAt?: string;
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
  /** Frozen at createRun from workflow + runtime defaults for prune/storage decisions. */
  policySnapshot?: PersistedRunPolicySnapshot;
  /** Successful node completions so far (for activation budget). */
  engineCounters?: EngineRunCounters;
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
    policySnapshot?: PersistedRunPolicySnapshot;
    engineCounters?: EngineRunCounters;
  }): Promise<void>;
  load(runId: RunId): Promise<PersistedRunState | undefined>;
  save(state: PersistedRunState): Promise<void>;
  deleteRun?(runId: RunId): Promise<void>;
}

export interface RunListingStore {
  listRuns(args?: Readonly<{ workflowId?: WorkflowId; limit?: number }>): Promise<ReadonlyArray<RunSummary>>;
}

/** Runs eligible for retention-based pruning (completed or failed, older than cutoff). */
export interface RunPruneCandidate {
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface RunPruneListingStore {
  listRunsOlderThan(args: Readonly<{ beforeIso: string; limit?: number }>): Promise<ReadonlyArray<RunPruneCandidate>>;
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

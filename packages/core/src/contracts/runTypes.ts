import type { TypeToken } from "../di";
import type { RunEventBus } from "../events/runEvents";
import type {
  Edge,
  InputPortKey,
  Items,
  JsonValue,
  NodeActivationId,
  NodeId,
  NodeIterationId,
  NodeKind,
  NodeOutputs,
  OutputPortKey,
  ParentExecutionRef,
  PersistedRunPolicySnapshot,
  PersistedTokenId,
  RunId,
  WorkflowDefinition,
  WorkflowId,
  WorkflowNodeConnection,
} from "./workflowTypes";

export interface RunExecutionOptions {
  /** Run-intent override: force the inline scheduler and bypass node-level offload decisions. */
  localOnly?: boolean;
  /** Marks runs started from webhook handling so orchestration can apply webhook-specific continuation rules. */
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
  /** Connection metadata for child nodes not in the execution graph (e.g. AI agent attachments). */
  connections?: ReadonlyArray<WorkflowNodeConnection>;
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
  details?: JsonValue;
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

/** Stable id for a single connection invocation row in {@link ConnectionInvocationRecord}. */
export type ConnectionInvocationId = string;

/**
 * One logical LLM or tool call under an owning workflow node (e.g. AI agent).
 * The owning node defines what {@link managedInput} and {@link managedOutput} contain.
 */
export interface ConnectionInvocationRecord {
  readonly invocationId: ConnectionInvocationId;
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly connectionNodeId: NodeId;
  readonly parentAgentNodeId: NodeId;
  readonly parentAgentActivationId: NodeActivationId;
  readonly status: NodeExecutionStatus;
  readonly managedInput?: JsonValue;
  readonly managedOutput?: JsonValue;
  readonly error?: NodeExecutionError;
  readonly queuedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
  /** Per-item iteration id minted by the engine when this invocation occurred inside a runnable node's per-item loop. */
  readonly iterationId?: NodeIterationId;
  /** Item index (0-based) of the iteration that produced this invocation. */
  readonly itemIndex?: number;
  /** When set, this invocation was produced inside a sub-agent triggered by the named parent invocation. */
  readonly parentInvocationId?: ConnectionInvocationId;
}

/** Arguments for appending a {@link ConnectionInvocationRecord} (engine fills run/workflow ids and timestamps). */
export type ConnectionInvocationAppendArgs = Readonly<{
  invocationId: ConnectionInvocationId;
  connectionNodeId: NodeId;
  parentAgentNodeId: NodeId;
  parentAgentActivationId: NodeActivationId;
  status: NodeExecutionStatus;
  managedInput?: JsonValue;
  managedOutput?: JsonValue;
  error?: NodeExecutionError;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  iterationId?: NodeIterationId;
  itemIndex?: number;
  parentInvocationId?: ConnectionInvocationId;
}>;

export interface RunCurrentState {
  outputsByNode: Record<NodeId, NodeOutputs>;
  nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
  /** Append-only history of connection-scoped invocations (LLM/tool) for inspector and canvas. */
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
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

export interface PersistedRunSchedulingState {
  pending?: PendingNodeExecution;
  queue: RunQueueEntry[];
}

export interface PersistedRunState {
  runId: RunId;
  workflowId: WorkflowId;
  startedAt: string;
  /** Canonical terminal time for listings and retention when persisted on the run root. */
  finishedAt?: string;
  /** Optimistic concurrency / CAS on the run aggregate (repository may increment on save). */
  revision?: number;
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
  /** Append-only history of connection invocations (LLM/tool) nested under owning nodes. */
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
}

export interface WorkflowExecutionRepository {
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
  loadSchedulingState(runId: RunId): Promise<PersistedRunSchedulingState | undefined>;
  save(state: PersistedRunState): Promise<void>;
  deleteRun?(runId: RunId): Promise<void>;
}

export interface WorkflowExecutionListingRepository {
  listRuns(args?: Readonly<{ workflowId?: WorkflowId; limit?: number }>): Promise<ReadonlyArray<RunSummary>>;
}

/** Runs eligible for retention-based pruning (completed or failed, older than cutoff). */
export interface RunPruneCandidate {
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface WorkflowExecutionPruneRepository {
  listRunsOlderThan(
    args: Readonly<{ nowIso: string; defaultRetentionSeconds: number; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>>;
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

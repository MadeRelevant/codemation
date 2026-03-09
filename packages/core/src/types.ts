import type { Container, TypeToken } from "./di";

export type WorkflowId = string;
export type NodeId = string;
export type OutputPortKey = string; // e.g. "main", "true", "false"
export type InputPortKey = string; // usually "in"

/**
 * Terminology:
 * - "node" = a non-trigger runnable node in the DAG
 * - "trigger" = a node that sets up a trigger source and emits items
 */
export type NodeKind = "trigger" | "node";

export interface Edge {
  from: { nodeId: NodeId; output: OutputPortKey };
  to: { nodeId: NodeId; input: InputPortKey };
}

export interface WorkflowDefinition {
  id: WorkflowId;
  name: string;
  nodes: NodeDefinition[];
  edges: Edge[];
}

export interface WorkflowGraph {
  next(nodeId: NodeId, output: OutputPortKey): ReadonlyArray<Readonly<{ nodeId: NodeId; input: InputPortKey }>>;
}

export interface WorkflowGraphFactory {
  create(def: WorkflowDefinition): WorkflowGraph;
}

export interface NodeConfigBase {
  readonly kind: NodeKind;
  readonly token: TypeToken<unknown>;
  readonly name?: string;
  readonly id?: NodeId;
  /**
   * Optional execution hint. A global offload policy may override this.
   */
  readonly execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
}

export interface NodeDefinition {
  id: NodeId;
  kind: NodeKind;
  token: TypeToken<unknown>;
  name?: string;
  config: NodeConfigBase;
}

export interface NodeRef {
  id: NodeId;
  kind: NodeKind;
  name?: string;
}

export type PairedItemRef = Readonly<{ nodeId: NodeId; output: OutputPortKey; itemIndex: number }>;

export type Item<TJson = unknown> = Readonly<{
  json: TJson;
  meta?: Readonly<Record<string, unknown>>;
  paired?: ReadonlyArray<PairedItemRef>;
}>;

export type Items<TJson = unknown> = ReadonlyArray<Item<TJson>>;

export type NodeOutputs = Partial<Record<OutputPortKey, Items>>;

export type CredentialId<TSecret = unknown> = string & { __secret?: TSecret };
export const credentialId = <TSecret,>(value: string) => value as CredentialId<TSecret>;

export interface CredentialService {
  get<TSecret>(id: CredentialId<TSecret>): Promise<TSecret>;
}

export type RunId = string;
export type NodeActivationId = string;

export interface ParentExecutionRef {
  runId: RunId;
  workflowId: WorkflowId;
  nodeId: NodeId;
}

export interface RunDataSnapshot {
  getOutputs(nodeId: NodeId): NodeOutputs | undefined;
  getOutputItems(nodeId: NodeId, output?: OutputPortKey): Items;
  getOutputItem(nodeId: NodeId, itemIndex: number, output?: OutputPortKey): Item | undefined;
}

export interface MutableRunData extends RunDataSnapshot {
  setOutputs(nodeId: NodeId, outputs: NodeOutputs): void;
  dump(): Record<NodeId, NodeOutputs>;
}

export interface RunDataFactory {
  create(initial?: Record<NodeId, NodeOutputs>): MutableRunData;
}

export interface WorkflowRunnerService {
  runById(args: { workflowId: WorkflowId; startAt?: NodeId; items: Items; parent?: ParentExecutionRef }): Promise<RunResult>;
}

export interface ExecutionServices {
  credentials: CredentialService;
  workflows?: WorkflowRunnerService;
  /**
   * Optional dependency resolver. In engine-hosted execution this is typically the engine DI container.
   * Nodes and tools may use this to resolve pluggable implementations by `TypeToken`.
   */
  container?: Container;
}

export interface ExecutionContext {
  runId: RunId;
  workflowId: WorkflowId;
  parent?: ParentExecutionRef;
  now: () => Date;
  services: ExecutionServices;
  data: RunDataSnapshot;
}

export interface ExecutionContextFactory {
  create(args: { runId: RunId; workflowId: WorkflowId; parent?: ParentExecutionRef; services: ExecutionServices; data: RunDataSnapshot }): ExecutionContext;
}

export interface NodeExecutionContext<TConfig extends NodeConfigBase = NodeConfigBase> extends ExecutionContext {
  nodeId: NodeId;
  activationId: NodeActivationId;
  config: TConfig;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface WebhookSpec {
  endpointKey: string;
  method: HttpMethod;
  handler: (req: unknown) => Promise<Items>;
}

export interface WebhookRegistration {
  endpointId: string;
  method: HttpMethod;
  path: string;
}

export interface TriggerInstanceId {
  workflowId: WorkflowId;
  nodeId: NodeId;
}

export interface TriggerSetupContext<TConfig extends NodeConfigBase = NodeConfigBase> extends ExecutionContext {
  trigger: TriggerInstanceId;
  config: TConfig;
  registerWebhook(spec: WebhookSpec): WebhookRegistration;
  emit(items: Items): Promise<void>;
}

export interface NodeActivationStats {
  activationId: NodeActivationId;
  nodeId: NodeId;
  itemsIn: number;
  itemsOutByPort: Readonly<Record<OutputPortKey, number>>;
}

export interface EngineHost {
  credentials: CredentialService;
  workflows?: WorkflowRunnerService;
  registerWebhook(spec: {
    workflowId: WorkflowId;
    nodeId: NodeId;
    endpointKey: string;
    method: HttpMethod;
    handler: (req: unknown) => Promise<Items>;
    basePath: string;
  }): WebhookRegistration;
  onNodeActivation(stats: NodeActivationStats): void;
}

export interface Node<TConfig extends NodeConfigBase = NodeConfigBase> {
  kind: "node";
  outputPorts: ReadonlyArray<OutputPortKey>;
  /**
   * Batch execution: nodes receive the whole items array and are responsible for iterating
   * (and choosing concurrency) internally.
   */
  execute(items: Items, ctx: NodeExecutionContext<TConfig>): Promise<NodeOutputs>;
}

export type NodeInputsByPort = Readonly<Record<InputPortKey, Items>>;

/**
 * Multi-input node API for fan-in style nodes (e.g. Merge).
 * Most nodes should stay on the simple `execute(items, ctx)` API.
 */
export interface MultiInputNode<TConfig extends NodeConfigBase = NodeConfigBase> {
  kind: "node";
  outputPorts: ReadonlyArray<OutputPortKey>;
  executeMulti(inputsByPort: NodeInputsByPort, ctx: NodeExecutionContext<TConfig>): Promise<NodeOutputs>;
}

export interface TriggerNode<TConfig extends NodeConfigBase = NodeConfigBase> {
  kind: "trigger";
  outputPorts: readonly ["main"];
  setup(ctx: TriggerSetupContext<TConfig>): Promise<void>;
}

export type UpstreamRefPlaceholder = `$${number}`;
export const branchRef = (index: number) => `$${index}` as UpstreamRefPlaceholder;

export type ExecutionMode = "local" | "worker";

export interface NodeSchedulerDecision {
  mode: ExecutionMode;
  queue?: string;
}

export interface NodeOffloadPolicy {
  decide(args: { workflowId: WorkflowId; nodeId: NodeId; config: NodeConfigBase }): NodeSchedulerDecision;
}

export interface NodeExecutionRequest {
  runId: RunId;
  activationId: NodeActivationId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  input: Items;
  parent?: ParentExecutionRef;
  queue?: string;
}

export interface NodeExecutionScheduler {
  enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }>;
  cancel?(receiptId: string): Promise<void>;
}

export type NodeActivationRequestBase = Readonly<{
  runId: RunId;
  activationId: NodeActivationId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  parent?: ParentExecutionRef;
  /**
   * Batch identifier for fan-in joins.
   */
  batchId?: string;
  /**
   * Fully constructed execution context for local execution.
   * Worker/offloaded execution may ignore this.
   */
  ctx: NodeExecutionContext;
}>;

export type NodeActivationRequest =
  | (NodeActivationRequestBase &
      Readonly<{
        kind: "single";
        input: Items;
      }>)
  | (NodeActivationRequestBase &
      Readonly<{
        kind: "multi";
        inputsByPort: NodeInputsByPort;
      }>);

export interface NodeActivationReceipt {
  receiptId: string;
  mode?: ExecutionMode;
  queue?: string;
}

/**
 * A minimal callback surface that allows a scheduler to report execution outcomes back to the engine.
 * This avoids a direct dependency on the concrete `Engine` class.
 */
export interface NodeActivationContinuation {
  resumeFromNodeResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult>;
  resumeFromNodeError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult>;
}

/**
 * Scheduler responsible for invoking activations (inline or offloaded) and reporting results back
 * via a bound continuation.
 */
export interface NodeActivationScheduler {
  /**
   * Bind the engine continuation that receives execution results/errors.
   */
  setContinuation?(continuation: NodeActivationContinuation): void;
  enqueue(request: NodeActivationRequest): Promise<NodeActivationReceipt>;
  cancel?(receiptId: string): Promise<void>;
}

export interface RunQueueEntry {
  nodeId: NodeId;
  input: Items;
  /**
   * Target input port on `nodeId` (used by multi-input nodes).
   * Defaults to "in" for normal nodes.
   */
  toInput?: InputPortKey;
  /**
   * Batch identifier used to join multiple upstream edges into one downstream activation.
   */
  batchId?: string;
  /**
   * Provenance of this queue entry (useful for debugging / joins).
   */
  from?: Readonly<{ nodeId: NodeId; output: OutputPortKey }>;
  /**
   * Multi-input collection state: when present, this queue entry represents a pending
   * multi-input activation for `nodeId` (e.g. Merge node waiting for in1+in2).
   */
  collect?: Readonly<{
    expectedInputs: ReadonlyArray<InputPortKey>;
    received: Readonly<Record<InputPortKey, Items>>;
  }>;
}

export type RunStatus = "running" | "pending" | "completed" | "failed";

export interface RunSummary {
  runId: RunId;
  workflowId: WorkflowId;
  startedAt: string; // ISO string
  status: RunStatus;
  parent?: ParentExecutionRef;
}

export interface PendingNodeExecution {
  runId: RunId;
  activationId: NodeActivationId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  itemsIn: number;
  receiptId: string;
  queue?: string;
  /**
   * Batch identifier for fan-in joins.
   * Present for local execution and for offloaded steps so resume can continue the same batch.
   */
  batchId?: string;
  enqueuedAt: string; // ISO string
}

export interface PersistedRunState {
  runId: RunId;
  workflowId: WorkflowId;
  startedAt: string; // ISO string
  parent?: ParentExecutionRef;
  status: RunStatus;
  pending?: PendingNodeExecution;
  queue: RunQueueEntry[];
  outputsByNode: Record<NodeId, NodeOutputs>;
}

export interface RunStateStore {
  createRun(args: { runId: RunId; workflowId: WorkflowId; startedAt: string; parent?: ParentExecutionRef }): Promise<void>;
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

export interface EngineDeps {
  container: Container;
  host: EngineHost;
  makeRunId: () => RunId;
  makeActivationId: () => NodeActivationId;
  webhookBasePath?: string;
  runStore?: RunStateStore;
  activationScheduler?: NodeActivationScheduler;
  scheduler?: NodeExecutionScheduler;
  offloadPolicy?: NodeOffloadPolicy;
  graphFactory?: WorkflowGraphFactory;
  runDataFactory?: RunDataFactory;
  executionContextFactory?: ExecutionContextFactory;
}


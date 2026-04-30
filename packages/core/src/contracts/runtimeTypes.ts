import type { ReadableStream as BinaryReadableStream } from "node:stream/web";
import type { TypeToken } from "../di";
import type { RunEventBus } from "../events/runEvents";
import type { CredentialSessionService } from "./credentialTypes";
import type { ExecutionTelemetry, ExecutionTelemetryFactory, NodeExecutionTelemetry } from "./telemetryTypes";
import type {
  ConnectionInvocationAppendArgs,
  ConnectionInvocationId,
  NodeInputsByPort,
  PersistedWorkflowSnapshot,
  PersistedWorkflowTokenRegistryLike,
  RunExecutionOptions,
  RunResult,
  WorkflowExecutionRepository,
} from "./runTypes";
import type { WorkflowActivationPolicy } from "./workflowActivationPolicy";
import type { TriggerInstanceId, WebhookTriggerMatcher } from "./webhookTypes";
import type { ZodType } from "zod";

import type {
  ActivationIdFactory,
  BinaryAttachment,
  Item,
  Items,
  JsonValue,
  NodeActivationId,
  NodeConfigBase,
  NodeId,
  NodeIterationId,
  NodeOutputs,
  RunnableNodeConfig,
  OutputPortKey,
  ParentExecutionRef,
  PersistedRunPolicySnapshot,
  RunDataFactory,
  RunDataSnapshot,
  RunId,
  RunIdFactory,
  TriggerNodeConfig,
  TriggerNodeSetupState,
  WorkflowDefinition,
  WorkflowId,
  WorkflowPolicyRuntimeDefaults,
} from "./workflowTypes";

export interface WorkflowRunnerService {
  runById(args: {
    workflowId: WorkflowId;
    startAt?: NodeId;
    items: Items;
    parent?: ParentExecutionRef;
  }): Promise<RunResult>;
}

export interface WorkflowRunnerResolver {
  resolve(): WorkflowRunnerService | undefined;
}

export interface WorkflowRepository {
  list(): ReadonlyArray<WorkflowDefinition>;
  get(workflowId: WorkflowId): WorkflowDefinition | undefined;
}

export interface LiveWorkflowRepository extends WorkflowRepository {
  setWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void;
}

export interface NodeResolver {
  resolve<T>(token: TypeToken<T>): T;
}

export interface NodeExecutionStatePublisher {
  markQueued(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort }): Promise<void>;
  markRunning(args: {
    nodeId: NodeId;
    activationId?: NodeActivationId;
    inputsByPort?: NodeInputsByPort;
  }): Promise<void>;
  markCompleted(args: {
    nodeId: NodeId;
    activationId?: NodeActivationId;
    inputsByPort?: NodeInputsByPort;
    outputs?: NodeOutputs;
  }): Promise<void>;
  markFailed(args: {
    nodeId: NodeId;
    activationId?: NodeActivationId;
    inputsByPort?: NodeInputsByPort;
    error: Error;
  }): Promise<void>;
  appendConnectionInvocation(args: ConnectionInvocationAppendArgs): Promise<void>;
}

export type BinaryBody = BinaryReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array | ArrayBuffer;

export interface BinaryStorageWriteRequest {
  storageKey: string;
  body: BinaryBody;
}

export interface BinaryStorageWriteResult {
  storageKey: string;
  size: number;
  sha256?: string;
}

export interface BinaryStorageReadResult {
  body: BinaryReadableStream<Uint8Array>;
  size?: number;
}

export interface BinaryStorageStatResult {
  exists: boolean;
  size?: number;
}

export interface BinaryStorage {
  readonly driverName: string;
  write(args: BinaryStorageWriteRequest): Promise<BinaryStorageWriteResult>;
  openReadStream(storageKey: string): Promise<BinaryStorageReadResult | undefined>;
  stat(storageKey: string): Promise<BinaryStorageStatResult>;
  delete(storageKey: string): Promise<void>;
}

export interface BinaryAttachmentCreateRequest {
  name: string;
  body: BinaryBody;
  mimeType: string;
  filename?: string;
  previewKind?: BinaryAttachment["previewKind"];
}

export interface NodeBinaryAttachmentService extends ExecutionBinaryService {
  attach(args: BinaryAttachmentCreateRequest): Promise<BinaryAttachment>;
  withAttachment<TJson>(item: Item<TJson>, name: string, attachment: BinaryAttachment): Item<TJson>;
}

export interface ExecutionBinaryService {
  forNode(args: { nodeId: NodeId; activationId: NodeActivationId }): NodeBinaryAttachmentService;
  openReadStream(attachment: BinaryAttachment): Promise<BinaryStorageReadResult | undefined>;
}

export interface ExecutionContext {
  runId: RunId;
  workflowId: WorkflowId;
  parent?: ParentExecutionRef;
  /** This run's subworkflow depth (0 = root). */
  subworkflowDepth: number;
  /** Effective activation budget cap for this run (after policy merge). */
  engineMaxNodeActivations: number;
  /** Effective subworkflow nesting cap for this run (after policy merge). */
  engineMaxSubworkflowDepth: number;
  now: () => Date;
  data: RunDataSnapshot;
  nodeState?: NodeExecutionStatePublisher;
  telemetry: ExecutionTelemetry;
  binary: ExecutionBinaryService;
  getCredential<TSession = unknown>(slotKey: string): Promise<TSession>;
  /** Per-item iteration id, set by {@link NodeExecutor} on the ctx passed into runnable `execute`. */
  iterationId?: NodeIterationId;
  /** Item index (0-based) within the current activation's batch; set alongside {@link iterationId}. */
  itemIndex?: number;
  /** When set, this ctx is executing inside a sub-agent triggered by the named parent invocation. */
  parentInvocationId?: ConnectionInvocationId;
}

export interface ExecutionContextFactory {
  create(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    policySnapshot?: PersistedRunPolicySnapshot;
    subworkflowDepth: number;
    engineMaxNodeActivations: number;
    engineMaxSubworkflowDepth: number;
    data: RunDataSnapshot;
    nodeState?: NodeExecutionStatePublisher;
    telemetry?: ExecutionTelemetry;
    getCredential<TSession = unknown>(slotKey: string): Promise<TSession>;
  }): ExecutionContext;
}

export interface NodeExecutionContext<TConfig extends NodeConfigBase = NodeConfigBase> extends ExecutionContext {
  nodeId: NodeId;
  activationId: NodeActivationId;
  config: TConfig;
  telemetry: NodeExecutionTelemetry;
  binary: NodeBinaryAttachmentService;
}

export interface TriggerSetupContext<
  TConfig extends TriggerNodeConfig<any, any> = TriggerNodeConfig<any, any>,
  TSetupState extends JsonValue | undefined = TriggerNodeSetupState<TConfig>,
> extends ExecutionContext {
  trigger: TriggerInstanceId;
  config: TConfig;
  previousState: TSetupState;
  registerCleanup(cleanup: TriggerCleanupHandle): void;
  emit(items: Items): Promise<void>;
}

export interface TriggerTestItemsContext<
  TConfig extends TriggerNodeConfig<any, any> = TriggerNodeConfig<any, any>,
  TSetupState extends JsonValue | undefined = TriggerNodeSetupState<TConfig>,
> extends ExecutionContext {
  trigger: TriggerInstanceId;
  nodeId: NodeId;
  config: TConfig;
  previousState: TSetupState;
}

/**
 * Trigger setup state is intentionally engine-owned so future ownership and
 * leader-election metadata can be coordinated centrally rather than pushed into
 * package-level setup code.
 */

export interface PersistedTriggerSetupState<TState extends JsonValue | undefined = JsonValue | undefined> {
  trigger: TriggerInstanceId;
  updatedAt: string;
  state: TState;
}

export interface TriggerSetupStateRepository {
  load(trigger: TriggerInstanceId): Promise<PersistedTriggerSetupState | undefined>;
  save(state: PersistedTriggerSetupState): Promise<void>;
  delete(trigger: TriggerInstanceId): Promise<void>;
}

export interface TriggerCleanupHandle {
  stop(): Promise<void> | void;
}

export interface EngineHost {
  credentialSessions: CredentialSessionService;
  workflows?: WorkflowRunnerService;
}

/**
 * Per-item runnable node: return JSON, an array to fan-out on `main`, an explicit `Item`, or {@link emitPorts}
 * for multi-port emission. Engine applies `inputSchema.parse(item.json)` and passes the result as `args.input`
 * (wire `item.json` is unchanged). Transform helpers may opt into binary preservation, while routers and
 * pass-through nodes should return explicit items when they need to preserve full item state.
 */
export interface RunnableNodeExecuteArgs<
  TConfig extends RunnableNodeConfig<any, any> = RunnableNodeConfig<any, any>,
  TInputJson = unknown,
> {
  readonly input: TInputJson;
  readonly item: Item;
  readonly itemIndex: number;
  readonly items: Items;
  readonly ctx: NodeExecutionContext<TConfig>;
}

export interface RunnableNode<
  TConfig extends RunnableNodeConfig<any, any> = RunnableNodeConfig<any, any>,
  TInputJson = unknown,
  _TOutputJson = unknown,
> {
  readonly kind: "node";
  /**
   * Declared output ports (e.g. `["main"]`).
   *
   * Prefer describing dynamic router ports (Switch) and fixed multi-ports (If true/false)
   * via {@link NodeConfigBase.declaredOutputPorts}. Engine defaults to `["main"]` when omitted.
   */
  readonly outputPorts?: ReadonlyArray<OutputPortKey>;
  /** When omitted, engine uses {@link RunnableNodeConfig.inputSchema} or `z.unknown()`. */
  readonly inputSchema?: ZodType<TInputJson>;
  execute(args: RunnableNodeExecuteArgs<TConfig, TInputJson>): Promise<unknown> | unknown;
}

/** @deprecated Use {@link RunnableNode} */
export type ItemNode<
  TConfig extends RunnableNodeConfig<any, any> = RunnableNodeConfig<any, any>,
  TInputJson = unknown,
  TOutputJson = unknown,
> = RunnableNode<TConfig, TInputJson, TOutputJson>;

export interface MultiInputNode<TConfig extends NodeConfigBase = NodeConfigBase> {
  kind: "node";
  /**
   * Declared output ports (typically `["main"]`).
   *
   * Prefer describing ports for authoring/canvas via {@link NodeConfigBase.declaredOutputPorts}.
   * Engine defaults to `["main"]` when omitted.
   */
  outputPorts?: ReadonlyArray<OutputPortKey>;
  executeMulti(inputsByPort: NodeInputsByPort, ctx: NodeExecutionContext<TConfig>): Promise<NodeOutputs>;
}

export type TriggerSetupStateFor<TConfig extends TriggerNodeConfig<any, any>> = TriggerNodeSetupState<TConfig>;

export interface TriggerNode<TConfig extends TriggerNodeConfig<any, any> = TriggerNodeConfig<any, any>> {
  kind: "trigger";
  outputPorts: readonly ["main"];
  setup(ctx: TriggerSetupContext<TConfig>): Promise<TriggerSetupStateFor<TConfig>>;
  execute(items: Items, ctx: NodeExecutionContext<TConfig>): Promise<NodeOutputs>;
}

export interface TestableTriggerNode<
  TConfig extends TriggerNodeConfig<any, any> = TriggerNodeConfig<any, any>,
> extends TriggerNode<TConfig> {
  getTestItems(ctx: TriggerTestItemsContext<TConfig>): Promise<Items>;
}

export type ExecutableTriggerNode<TConfig extends TriggerNodeConfig<any, any> = TriggerNodeConfig<any, any>> =
  TriggerNode<TConfig>;

export interface NodeExecutionRequest {
  runId: RunId;
  activationId: NodeActivationId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  input: Items;
  parent?: ParentExecutionRef;
  queue?: string;
  executionOptions?: RunExecutionOptions;
}

export interface NodeExecutionScheduler {
  enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }>;
  cancel?(receiptId: string): Promise<void>;
}

export interface NodeExecutionRequestHandler {
  handleNodeExecutionRequest(request: NodeExecutionRequest): Promise<void>;
}

export type NodeActivationRequestBase = Readonly<{
  runId: RunId;
  activationId: NodeActivationId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
  batchId?: string;
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
  mode?: "local" | "worker";
  queue?: string;
}

export interface PreparedNodeActivationDispatch {
  readonly receipt: NodeActivationReceipt;
  dispatch(): Promise<void>;
}

export interface NodeActivationContinuation {
  markNodeRunning(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    inputsByPort: NodeInputsByPort;
  }): Promise<void>;
  resumeFromNodeResult(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    outputs: NodeOutputs;
  }): Promise<RunResult>;
  resumeFromNodeError(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    error: Error;
  }): Promise<RunResult>;
}

export interface NodeActivationScheduler {
  setContinuation?(continuation: NodeActivationContinuation): void;
  prepareDispatch(request: NodeActivationRequest): Promise<PreparedNodeActivationDispatch>;
  cancel?(receiptId: string): Promise<void>;
}

export interface WorkflowNodeInstanceFactory {
  createNodes(workflow: WorkflowDefinition): ReadonlyMap<NodeId, unknown>;
  createByType(type: TypeToken<unknown>): unknown;
}

export interface NodeExecutor {
  execute(request: NodeActivationRequest): Promise<NodeOutputs>;
}

export interface WorkflowSnapshotFactory {
  create(workflow: WorkflowDefinition): PersistedWorkflowSnapshot;
}

export interface WorkflowSnapshotResolver {
  resolve(args: {
    workflowId: WorkflowId;
    workflowSnapshot?: PersistedWorkflowSnapshot;
  }): WorkflowDefinition | undefined;
}

/** Optional host wiring for trigger lifecycle logs (boot skip + activation sync). */
export interface TriggerRuntimeDiagnostics {
  info(message: string): void;
  warn(message: string): void;
}

export interface EngineDeps {
  credentialSessions: CredentialSessionService;
  liveWorkflowRepository: LiveWorkflowRepository;
  workflowRepository: WorkflowRepository;
  /** When {@link AllWorkflowsActiveWorkflowActivationPolicy}, all workflows behave as active (tests). */
  workflowActivationPolicy: WorkflowActivationPolicy;
  nodeResolver: NodeResolver;
  triggerSetupStateRepository: TriggerSetupStateRepository;
  webhookTriggerMatcher: WebhookTriggerMatcher;
  runIdFactory: RunIdFactory;
  activationIdFactory: ActivationIdFactory;
  workflowExecutionRepository: WorkflowExecutionRepository;
  activationScheduler: NodeActivationScheduler;
  runDataFactory: RunDataFactory;
  executionContextFactory: ExecutionContextFactory;
  executionTelemetryFactory?: ExecutionTelemetryFactory;
  nodeExecutor: NodeExecutor;
  eventBus?: RunEventBus;
  tokenRegistry: PersistedWorkflowTokenRegistryLike;
  workflowNodeInstanceFactory: WorkflowNodeInstanceFactory;
  /** Defaults for prune/storage snapshot when workflow omits explicit policy fields. */
  workflowPolicyRuntimeDefaults?: WorkflowPolicyRuntimeDefaults;
  /** When set, logs inactive-workflow skips at boot and trigger start/stop on activation changes. */
  triggerRuntimeDiagnostics?: TriggerRuntimeDiagnostics;
}

import type { ReadableStream as BinaryReadableStream } from "node:stream/web";
import type { Container, TypeToken } from "../di";
import type { RunEventBus } from "../events/runEvents";
import type {
  ActivationIdFactory,
  BinaryAttachment,
  CredentialService,
  Item,
  Items,
  NodeActivationId,
  NodeConfigBase,
  NodeId,
  NodeOutputs,
  OutputPortKey,
  ParentExecutionRef,
  RunDataSnapshot,
  RunDataFactory,
  RunId,
  RunIdFactory,
  WorkflowDefinition,
  WorkflowId,
} from "./workflowTypes";
import type {
  NodeInputsByPort,
  PersistedWorkflowTokenRegistryLike,
  RunExecutionOptions,
  RunResult,
  RunStateStore,
} from "./runTypes";
import type {
  HttpMethod,
  TriggerInstanceId,
  WebhookRegistration,
  WebhookSpec,
  WebhookTriggerMatcher,
} from "./webhookTypes";

export interface WorkflowRunnerService {
  runById(args: { workflowId: WorkflowId; startAt?: NodeId; items: Items; parent?: ParentExecutionRef }): Promise<RunResult>;
}

export interface WorkflowRunnerResolver {
  resolve(): WorkflowRunnerService | undefined;
}

export interface WorkflowRegistry {
  setWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void;
  list(): ReadonlyArray<WorkflowDefinition>;
  get(workflowId: WorkflowId): WorkflowDefinition | undefined;
}

export interface NodeResolver {
  resolve<T>(token: TypeToken<T>): T;
  getContainer(): Container | undefined;
}

export interface WebhookRegistrar {
  registerWebhook(spec: {
    workflowId: WorkflowId;
    nodeId: NodeId;
    endpointKey: string;
    methods: ReadonlyArray<HttpMethod>;
    parseJsonBody?: (body: unknown) => unknown;
    basePath: string;
  }): WebhookRegistration;
}

export interface NodeActivationObserver {
  onNodeActivation(stats: NodeActivationStats): void;
}

export interface NodeExecutionStatePublisher {
  markQueued(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort }): Promise<void>;
  markRunning(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort }): Promise<void>;
  markCompleted(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort; outputs?: NodeOutputs }): Promise<void>;
  markFailed(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort; error: Error }): Promise<void>;
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
  now: () => Date;
  data: RunDataSnapshot;
  nodeState?: NodeExecutionStatePublisher;
  binary: ExecutionBinaryService;
}

export interface ExecutionContextFactory {
  create(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    data: RunDataSnapshot;
    nodeState?: NodeExecutionStatePublisher;
  }): ExecutionContext;
}

export interface NodeExecutionContext<TConfig extends NodeConfigBase = NodeConfigBase> extends ExecutionContext {
  nodeId: NodeId;
  activationId: NodeActivationId;
  config: TConfig;
  binary: NodeBinaryAttachmentService;
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
    methods: ReadonlyArray<HttpMethod>;
    parseJsonBody?: (body: unknown) => unknown;
    basePath: string;
  }): WebhookRegistration;
  onNodeActivation(stats: NodeActivationStats): void;
}

export interface Node<TConfig extends NodeConfigBase = NodeConfigBase> {
  kind: "node";
  outputPorts: ReadonlyArray<OutputPortKey>;
  execute(items: Items, ctx: NodeExecutionContext<TConfig>): Promise<NodeOutputs>;
}

export interface MultiInputNode<TConfig extends NodeConfigBase = NodeConfigBase> {
  kind: "node";
  outputPorts: ReadonlyArray<OutputPortKey>;
  executeMulti(inputsByPort: NodeInputsByPort, ctx: NodeExecutionContext<TConfig>): Promise<NodeOutputs>;
}

export interface TriggerNode<TConfig extends NodeConfigBase = NodeConfigBase> {
  kind: "trigger";
  outputPorts: readonly ["main"];
  setup(ctx: TriggerSetupContext<TConfig>): Promise<void>;
  execute(items: Items, ctx: NodeExecutionContext<TConfig>): Promise<NodeOutputs>;
}

export interface ExecutableTriggerNode<TConfig extends NodeConfigBase = NodeConfigBase> extends TriggerNode<TConfig> {}

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

export interface NodeActivationContinuation {
  markNodeRunning(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    inputsByPort: NodeInputsByPort;
  }): Promise<void>;
  resumeFromNodeResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult>;
  resumeFromNodeError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult>;
}

export interface NodeActivationScheduler {
  setContinuation?(continuation: NodeActivationContinuation): void;
  enqueue(request: NodeActivationRequest): Promise<NodeActivationReceipt>;
  notifyPendingStatePersisted?(runId: RunId): void;
  cancel?(receiptId: string): Promise<void>;
}

export interface EngineDeps {
  credentials: CredentialService;
  workflowRunnerResolver: WorkflowRunnerResolver;
  workflowRegistry: WorkflowRegistry;
  nodeResolver: NodeResolver;
  webhookRegistrar: WebhookRegistrar;
  webhookTriggerMatcher?: WebhookTriggerMatcher;
  nodeActivationObserver: NodeActivationObserver;
  runIdFactory: RunIdFactory;
  activationIdFactory: ActivationIdFactory;
  webhookBasePath?: string;
  runStore: RunStateStore;
  activationScheduler: NodeActivationScheduler;
  runDataFactory: RunDataFactory;
  executionContextFactory: ExecutionContextFactory;
  eventBus?: RunEventBus;
  tokenRegistry?: PersistedWorkflowTokenRegistryLike;
}

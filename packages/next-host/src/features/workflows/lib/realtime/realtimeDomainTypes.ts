import type { Item as WorkflowItem, JsonValue } from "@codemation/core/browser";
import type { WorkflowDto } from "@codemation/host-src/application/contracts/WorkflowViewContracts";

export type Item = WorkflowItem;
export type Items = ReadonlyArray<Item>;

export type RunExecutionOptions = Readonly<{
  localOnly?: boolean;
  webhook?: boolean;
  mode?: "manual" | "debug";
  sourceWorkflowId?: string;
  sourceRunId?: string;
  derivedFromRunId?: string;
  isMutable?: boolean;
}>;

export type PersistedWorkflowConnection = Readonly<{
  parentNodeId: string;
  connectionName: string;
  childNodeIds: ReadonlyArray<string>;
}>;

export type PersistedWorkflowSnapshot = Readonly<{
  id: string;
  name: string;
  workflowErrorHandlerConfigured?: boolean;
  connections?: ReadonlyArray<PersistedWorkflowConnection>;
  nodes: ReadonlyArray<
    Readonly<{
      id: string;
      kind: string;
      name?: string;
      nodeTokenId: string;
      configTokenId: string;
      tokenName?: string;
      configTokenName?: string;
      config: unknown;
    }>
  >;
  edges: WorkflowDto["edges"];
}>;

export type PersistedMutableNodeState = Readonly<{
  pinnedOutputsByPort?: Readonly<Record<string, Items>>;
  lastDebugInput?: Items;
}>;

export type PersistedMutableRunState = Readonly<{
  nodesById: Readonly<Record<string, PersistedMutableNodeState>>;
}>;

export type ParentExecutionRef = Readonly<{ runId: string; workflowId: string; nodeId: string }>;

export type RunSummary = Readonly<{
  runId: string;
  workflowId: string;
  startedAt: string;
  status: string;
  finishedAt?: string;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
}>;

export type NodeExecutionSnapshot = Readonly<{
  runId: string;
  workflowId: string;
  nodeId: string;
  activationId?: string;
  parent?: ParentExecutionRef;
  status: "pending" | "queued" | "running" | "completed" | "failed" | "skipped";
  usedPinnedOutput?: boolean;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  inputsByPort?: Readonly<Record<string, Items>>;
  outputs?: Readonly<Record<string, Items>>;
  error?: Readonly<{ message: string; name?: string; stack?: string; details?: JsonValue }>;
}>;

/** One LLM/tool invocation under an agent; mirrors core {@link ConnectionInvocationRecord}. */
export type ConnectionInvocationRecord = Readonly<{
  invocationId: string;
  runId: string;
  workflowId: string;
  connectionNodeId: string;
  parentAgentNodeId: string;
  parentAgentActivationId: string;
  status: NodeExecutionSnapshot["status"];
  managedInput?: JsonValue;
  managedOutput?: JsonValue;
  error?: NodeExecutionSnapshot["error"];
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  /** Per-item iteration that produced this invocation (set by the engine inside runnable per-item loops). */
  iterationId?: string;
  /** Item index (0-based) of the iteration within the activation. */
  itemIndex?: number;
  /** When set, this invocation was produced inside a sub-agent triggered by the named parent invocation. */
  parentInvocationId?: string;
}>;

/**
 * One per-item iteration projected from the connection invocations for a run.
 *
 * Each iteration represents a single item processed by an agent within an activation. Multiple
 * invocations (LLM rounds, tool calls) belonging to the same iteration share the iterationId.
 */
export type RunIterationRecord = Readonly<{
  iterationId: string;
  agentNodeId: string;
  activationId: string;
  itemIndex: number;
  itemSummary?: string;
  status: NodeExecutionSnapshot["status"];
  startedAt?: string;
  finishedAt?: string;
  invocationIds: ReadonlyArray<string>;
  parentInvocationId?: string;
  /** Estimated cost (rolled up from `codemation.cost.estimated`) keyed by ISO currency code. Values are minor units per `cost.currency_scale`. */
  estimatedCostMinorByCurrency?: Readonly<Record<string, number>>;
  /** Currency scale (denominator) per currency, when present on the metric points. */
  estimatedCostCurrencyScaleByCurrency?: Readonly<Record<string, number>>;
}>;

export type PendingNodeExecution = Readonly<{
  runId: string;
  activationId: string;
  workflowId: string;
  nodeId: string;
  itemsIn: number;
  inputsByPort: Readonly<Record<string, Items>>;
  receiptId: string;
  queue?: string;
  batchId?: string;
  enqueuedAt: string;
}>;

export type PersistedRunState = Readonly<{
  runId: string;
  workflowId: string;
  startedAt: string;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
  workflowSnapshot?: PersistedWorkflowSnapshot;
  mutableState?: PersistedMutableRunState;
  status: "running" | "pending" | "completed" | "failed";
  pending?: PendingNodeExecution;
  queue: ReadonlyArray<unknown>;
  outputsByNode: Readonly<Record<string, Readonly<Record<string, Items>>>>;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
}>;

export type SlotExecutionStateDto = Readonly<{
  slotNodeId: string;
  latestInstanceId?: string;
  latestTerminalInstanceId?: string;
  latestRunningInstanceId?: string;
  status?: NodeExecutionSnapshot["status"];
  invocationCount: number;
  runCount: number;
}>;

export type ExecutionInstanceDto = Readonly<{
  instanceId: string;
  slotNodeId: string;
  workflowNodeId: string;
  parentInstanceId?: string;
  kind: "workflowNodeActivation" | "connectionInvocation";
  connectionKind?: "languageModel" | "tool" | "nestedAgent";
  runIndex: number;
  batchId: string;
  activationId?: string;
  status: NodeExecutionSnapshot["status"];
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  itemCount: number;
  inputJson?: JsonValue;
  outputJson?: JsonValue;
  error?: NodeExecutionSnapshot["error"];
}>;

export type WorkflowRunDetailDto = Readonly<{
  runId: string;
  workflowId: string;
  startedAt: string;
  finishedAt?: string;
  status: PersistedRunState["status"];
  workflowSnapshot?: PersistedWorkflowSnapshot;
  mutableState?: PersistedMutableRunState;
  slotStates: ReadonlyArray<SlotExecutionStateDto>;
  executionInstances: ReadonlyArray<ExecutionInstanceDto>;
  iterations?: ReadonlyArray<RunIterationRecord>;
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
}>;

export type RunCurrentState = Readonly<{
  outputsByNode: PersistedRunState["outputsByNode"];
  nodeSnapshotsByNodeId: PersistedRunState["nodeSnapshotsByNodeId"];
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
  mutableState?: PersistedMutableRunState;
}>;

export type WorkflowDebuggerOverlayState = Readonly<{
  workflowId: string;
  updatedAt: string;
  copiedFromRunId?: string;
  currentState: RunCurrentState;
}>;

export type WorkflowDevBuildState = Readonly<{
  state: "idle" | "building" | "failed";
  updatedAt: string;
  buildVersion?: string;
  message?: string;
  awaitingWorkflowRefreshAt?: string;
}>;

export type TelemetryAttributesDto = Readonly<Record<string, JsonValue>>;

export type TelemetrySpanRecordDto = Readonly<{
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  workflowId: string;
  nodeId?: string;
  activationId?: string;
  connectionInvocationId?: string;
  name: string;
  kind: "internal" | "client";
  status?: "running" | "completed" | "failed";
  statusMessage?: string;
  startTime?: string;
  endTime?: string;
  workflowFolder?: string;
  nodeType?: string;
  nodeRole?: string;
  modelName?: string;
  attributes?: TelemetryAttributesDto;
  events?: ReadonlyArray<unknown>;
  retentionExpiresAt?: string;
  iterationId?: string;
  itemIndex?: number;
  parentInvocationId?: string;
}>;

export type TelemetryArtifactRecordDto = Readonly<{
  artifactId: string;
  traceId: string;
  spanId: string;
  runId: string;
  workflowId: string;
  nodeId?: string;
  activationId?: string;
  kind: string;
  contentType: string;
  previewText?: string;
  previewJson?: unknown;
  payloadText?: string;
  payloadJson?: unknown;
  bytes?: number;
  truncated?: boolean;
  createdAt: string;
  expiresAt?: string;
  retentionExpiresAt?: string;
}>;

export type TelemetryMetricPointRecordDto = Readonly<{
  metricPointId: string;
  traceId?: string;
  spanId?: string;
  runId?: string;
  workflowId: string;
  nodeId?: string;
  activationId?: string;
  metricName: string;
  value: number;
  unit?: string;
  observedAt: string;
  workflowFolder?: string;
  nodeType?: string;
  nodeRole?: string;
  modelName?: string;
  dimensions?: TelemetryAttributesDto;
  retentionExpiresAt?: string;
  iterationId?: string;
  itemIndex?: number;
  parentInvocationId?: string;
}>;

export type TelemetryRunTraceViewDto = Readonly<{
  traceId: string;
  runId: string;
  spans: ReadonlyArray<TelemetrySpanRecordDto>;
  artifacts: ReadonlyArray<TelemetryArtifactRecordDto>;
  metricPoints: ReadonlyArray<TelemetryMetricPointRecordDto>;
}>;

export type WorkflowEvent =
  | Readonly<{ kind: "runCreated"; runId: string; workflowId: string; parent?: ParentExecutionRef; at: string }>
  | Readonly<{
      kind: "runSaved";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      state: PersistedRunState;
    }>
  | Readonly<{
      kind: "nodeQueued";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeStarted";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeCompleted";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeFailed";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "connectionInvocationStarted";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>
  | Readonly<{
      kind: "connectionInvocationCompleted";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>
  | Readonly<{
      kind: "connectionInvocationFailed";
      runId: string;
      workflowId: string;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>;

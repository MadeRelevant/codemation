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
  error?: Readonly<{ message: string; name?: string; stack?: string }>;
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
    }>;

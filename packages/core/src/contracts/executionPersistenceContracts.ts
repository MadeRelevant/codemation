import type { JsonValue, NodeActivationId, NodeId, RunId, WorkflowId } from "./workflowTypes";
import type {
  NodeExecutionError,
  NodeExecutionStatus,
  PersistedMutableRunState,
  PersistedWorkflowSnapshot,
  RunStatus,
} from "./runTypes";

/** Canonical id for persisted execution rows (activation or connection invocation). */
export type ExecutionInstanceId = string;

/** Stable id for persisted work-queue rows. */
export type WorkItemId = string;

/** Batch grouping for planner activations. */
export type BatchId = string;

/** Optimistic concurrency on the run root. */
export type RunRevision = number;

export type PersistedRunWorkItemKind = "queue" | "pending";

export type WorkItemStatus = "queued" | "claimed" | "completed" | "failed" | "cancelled";

export type PersistedExecutionInstanceKind = "workflowNodeActivation" | "connectionInvocation";

export type ConnectionInvocationKind = "languageModel" | "tool" | "nestedAgent";

export type PayloadStorageKind = "inline" | "external" | "omitted";

/**
 * Persisted run-work-queue row (queue entry or pending activation).
 * Serialized to {@link RunWorkItem} in Prisma; engine still uses {@link PersistedRunState} queue + pending.
 */
export interface PersistedRunWorkItemRecord {
  readonly workItemId: WorkItemId;
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly kind: PersistedRunWorkItemKind;
  readonly orderIndex: number;
  readonly status: WorkItemStatus;
  readonly queueName?: string;
  readonly claimToken?: string;
  readonly claimedBy?: string;
  readonly claimedAt?: string;
  readonly availableAt: string;
  readonly enqueuedAt: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
  readonly sourceInstanceId?: ExecutionInstanceId;
  readonly parentInstanceId?: ExecutionInstanceId;
  readonly itemsIn: number;
  /** Queue entry when kind is queue; pending activation when kind is pending. */
  readonly payloadJson: string;
  readonly error?: Readonly<NodeExecutionError>;
}

/**
 * Payload policy fields for large-batch externalization (optional on first rollout).
 */
export interface ExecutionPayloadPolicyFields {
  readonly inputStorageKind: PayloadStorageKind;
  readonly outputStorageKind: PayloadStorageKind;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
  readonly inputPreviewJson?: unknown;
  readonly outputPreviewJson?: unknown;
  readonly inputPayloadRef?: string;
  readonly outputPayloadRef?: string;
  readonly inputTruncated?: boolean;
  readonly outputTruncated?: boolean;
}

/**
 * One persisted execution row (workflow node activation or connection invocation).
 */
export interface PersistedExecutionInstanceRecord {
  readonly instanceId: ExecutionInstanceId;
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly slotNodeId: NodeId;
  readonly workflowNodeId: NodeId;
  readonly kind: PersistedExecutionInstanceKind;
  readonly connectionKind?: ConnectionInvocationKind;
  readonly activationId?: NodeActivationId;
  readonly batchId: BatchId;
  readonly runIndex: number;
  readonly parentInstanceId?: ExecutionInstanceId;
  readonly parentRunId?: RunId;
  readonly workerClaimToken?: string;
  readonly status: NodeExecutionStatus;
  readonly queuedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
  readonly itemCount: number;
  readonly inputJson?: string;
  readonly outputJson?: string;
  readonly errorJson?: string;
  readonly inputItemIndicesJson?: string;
  readonly outputItemCount?: number;
  readonly successfulItemCount?: number;
  readonly failedItemCount?: number;
  readonly truncatedInputPreviewJson?: string;
  readonly truncatedOutputPreviewJson?: string;
  readonly inputTruncated?: boolean;
  readonly outputTruncated?: boolean;
  readonly usedPinnedOutput?: boolean;
  readonly payloadPolicy?: ExecutionPayloadPolicyFields;
}

/**
 * Cached slot projection for planner/debugger/UI (not canonical history).
 */
export interface RunSlotProjectionState {
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly revision: RunRevision;
  readonly slotStatesByNodeId: Record<
    NodeId,
    Readonly<{
      latestInstanceId?: ExecutionInstanceId;
      latestTerminalInstanceId?: ExecutionInstanceId;
      latestRunningInstanceId?: ExecutionInstanceId;
      latestStatus?: NodeExecutionStatus;
      invocationCount: number;
      runCount: number;
    }>
  >;
}

export interface PersistedRunSlotProjectionRecord {
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly revision: RunRevision;
  readonly updatedAt: string;
  readonly slotStatesJson: string;
}

export interface WorkflowRunDetailDto {
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly status: RunStatus;
  readonly workflowSnapshot?: PersistedWorkflowSnapshot;
  readonly mutableState?: PersistedMutableRunState;
  readonly slotStates: ReadonlyArray<SlotExecutionStateDto>;
  readonly executionInstances: ReadonlyArray<ExecutionInstanceDto>;
  readonly iterations?: ReadonlyArray<RunIterationDto>;
}

/**
 * Per-item iteration projected from connection invocations and node activations.
 *
 * One iteration = one item processed by an agent within an activation. Multiple invocations
 * (LLM rounds, tool calls) belonging to the same iteration share the iterationId.
 */
export interface RunIterationDto {
  readonly iterationId: string;
  readonly agentNodeId: NodeId;
  readonly activationId: NodeActivationId;
  readonly itemIndex: number;
  readonly itemSummary?: string;
  readonly status: NodeExecutionStatus;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly invocationIds: ReadonlyArray<string>;
  readonly parentInvocationId?: string;
  /** Estimated cost rolled up from telemetry cost metric points, keyed by ISO currency code (e.g. "USD"). Values are minor units (cents-of-cents per the metric's `cost.currency_scale`). */
  readonly estimatedCostMinorByCurrency?: Readonly<Record<string, number>>;
  /** Currency scale (denominator) per currency, when present on the metric points. Joined with `estimatedCostMinorByCurrency` to format human-readable amounts. */
  readonly estimatedCostCurrencyScaleByCurrency?: Readonly<Record<string, number>>;
}

export interface SlotExecutionStateDto {
  readonly slotNodeId: NodeId;
  readonly latestInstanceId?: ExecutionInstanceId;
  readonly latestTerminalInstanceId?: ExecutionInstanceId;
  readonly latestRunningInstanceId?: ExecutionInstanceId;
  readonly status?: NodeExecutionStatus;
  readonly invocationCount: number;
  readonly runCount: number;
}

export interface ExecutionInstanceDto {
  readonly instanceId: ExecutionInstanceId;
  readonly slotNodeId: NodeId;
  readonly workflowNodeId: NodeId;
  readonly parentInstanceId?: ExecutionInstanceId;
  readonly kind: PersistedExecutionInstanceKind;
  readonly connectionKind?: ConnectionInvocationKind;
  readonly runIndex: number;
  readonly batchId: BatchId;
  readonly activationId?: NodeActivationId;
  readonly status: NodeExecutionStatus;
  readonly queuedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly itemCount: number;
  readonly inputJson?: JsonValue;
  readonly outputJson?: JsonValue;
  readonly error?: Readonly<NodeExecutionError>;
  /** Per-item iteration that produced this instance. Set on connectionInvocation rows produced inside per-item runnable loops. */
  readonly iterationId?: string;
  /** Item index (0-based) of the iteration. */
  readonly itemIndex?: number;
  /** Parent invocation id when this instance was emitted by a sub-agent triggered by an outer LLM/tool call. */
  readonly parentInvocationId?: string;
}

export interface WorkflowDetailSelectionState {
  readonly selectedSlotNodeId: NodeId | null;
  readonly selectedInstanceId: ExecutionInstanceId | null;
}

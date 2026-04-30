import type { QueryClient } from "@tanstack/react-query";

import { RunFinishedAtFactory } from "@codemation/core/browser";

import type {
  ConnectionInvocationRecord,
  Items,
  PersistedRunState,
  RunSummary,
  WorkflowEvent,
} from "./realtimeDomainTypes";
import { runQueryKey, workflowRunsQueryKey } from "./realtimeQueryKeys";

function countItems(inputsByPort: Readonly<Record<string, Items>> | undefined): number {
  return Object.values(inputsByPort ?? {}).reduce((sum, items) => sum + items.length, 0);
}

function createInitialRunState(event: Extract<WorkflowEvent, { kind: "runCreated" }>): PersistedRunState {
  return {
    runId: event.runId,
    workflowId: event.workflowId,
    startedAt: event.at,
    parent: event.parent,
    executionOptions: undefined,
    workflowSnapshot: undefined,
    mutableState: undefined,
    status: "running",
    pending: undefined,
    queue: [],
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
  };
}

function toRunSummary(state: PersistedRunState): RunSummary {
  return {
    runId: state.runId,
    workflowId: state.workflowId,
    startedAt: state.startedAt,
    status: state.status,
    finishedAt: RunFinishedAtFactory.resolveIso(state),
    parent: state.parent,
    executionOptions: state.executionOptions,
  };
}

function mergeRunSummaryList(
  existing: ReadonlyArray<RunSummary> | undefined,
  summary: RunSummary,
): ReadonlyArray<RunSummary> {
  const current = [...(existing ?? [])];
  const index = current.findIndex((entry) => entry.runId === summary.runId);
  if (index >= 0) current[index] = summary;
  else current.unshift(summary);
  current.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return current;
}

export function reduceWorkflowEventIntoPersistedRunState(
  current: PersistedRunState | undefined,
  event: WorkflowEvent,
): PersistedRunState {
  if (event.kind === "runCreated") {
    return createInitialRunState(event);
  }
  if (event.kind === "runSaved") {
    return event.state;
  }
  if (
    event.kind === "connectionInvocationStarted" ||
    event.kind === "connectionInvocationCompleted" ||
    event.kind === "connectionInvocationFailed"
  ) {
    return mergeConnectionInvocationIntoRunState(
      current,
      event as Extract<
        WorkflowEvent,
        {
          kind: "connectionInvocationStarted" | "connectionInvocationCompleted" | "connectionInvocationFailed";
        }
      >,
    );
  }
  return mergeSnapshotIntoRunState(
    current,
    event as Extract<WorkflowEvent, { kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed" }>,
  );
}

/**
 * Applies a per-invocation event onto the run state, deduplicating by `invocationId`.
 *
 * Surgical events let the timeline reflect each LLM round / tool call as it transitions
 * from running → completed without waiting for a coarse `runSaved` snapshot.
 */
function mergeConnectionInvocationIntoRunState(
  current: PersistedRunState | undefined,
  event: Extract<
    WorkflowEvent,
    {
      kind: "connectionInvocationStarted" | "connectionInvocationCompleted" | "connectionInvocationFailed";
    }
  >,
): PersistedRunState {
  const base =
    current ??
    ({
      runId: event.runId,
      workflowId: event.workflowId,
      startedAt: event.at,
      parent: event.parent,
      executionOptions: undefined,
      workflowSnapshot: undefined,
      mutableState: undefined,
      status: "pending",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    } satisfies PersistedRunState);
  const existing: ReadonlyArray<ConnectionInvocationRecord> = base.connectionInvocations ?? [];
  const next: ConnectionInvocationRecord[] = [];
  let replaced = false;
  for (const inv of existing) {
    if (inv.invocationId === event.record.invocationId) {
      next.push(event.record);
      replaced = true;
    } else {
      next.push(inv);
    }
  }
  if (!replaced) {
    next.push(event.record);
  }
  return {
    ...base,
    parent: base.parent ?? event.parent,
    connectionInvocations: next,
  };
}

function mergeSnapshotIntoRunState(
  current: PersistedRunState | undefined,
  event: Extract<WorkflowEvent, { kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed" }>,
): PersistedRunState {
  const base =
    current ??
    ({
      runId: event.runId,
      workflowId: event.workflowId,
      startedAt: event.at,
      parent: event.parent,
      executionOptions: undefined,
      workflowSnapshot: undefined,
      mutableState: undefined,
      status: event.kind === "nodeFailed" ? "failed" : "pending",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    } satisfies PersistedRunState);

  const nextNodeSnapshots = {
    ...(base.nodeSnapshotsByNodeId ?? {}),
    [event.snapshot.nodeId]: event.snapshot,
  };
  const nextOutputsByNode =
    event.snapshot.outputs === undefined
      ? base.outputsByNode
      : {
          ...(base.outputsByNode ?? {}),
          [event.snapshot.nodeId]: event.snapshot.outputs,
        };

  const nextPending =
    event.kind === "nodeQueued" || event.kind === "nodeStarted"
      ? {
          runId: event.runId,
          activationId: event.snapshot.activationId ?? `live_${event.snapshot.nodeId}`,
          workflowId: event.workflowId,
          nodeId: event.snapshot.nodeId,
          itemsIn: countItems(event.snapshot.inputsByPort),
          inputsByPort: event.snapshot.inputsByPort ?? {},
          receiptId: "live",
          enqueuedAt: event.snapshot.queuedAt ?? event.at,
        }
      : base.pending?.nodeId === event.snapshot.nodeId
        ? undefined
        : base.pending;
  const hasActiveSnapshots = Object.values(nextNodeSnapshots).some(
    (snapshot) => snapshot.status === "queued" || snapshot.status === "running",
  );
  const nextStatus =
    event.kind === "nodeFailed"
      ? "failed"
      : event.kind === "nodeCompleted" && !nextPending && !hasActiveSnapshots
        ? "completed"
        : event.kind === "nodeCompleted"
          ? base.status
          : "pending";

  return {
    ...base,
    parent: base.parent ?? event.parent,
    status: nextStatus,
    pending: nextPending,
    outputsByNode: nextOutputsByNode,
    nodeSnapshotsByNodeId: nextNodeSnapshots,
  };
}

export function applyWorkflowEvent(queryClient: QueryClient, event: WorkflowEvent): void {
  const key = runQueryKey(event.runId);
  const runsKey = workflowRunsQueryKey(event.workflowId);

  if (event.kind === "runCreated") {
    const next = reduceWorkflowEventIntoPersistedRunState(undefined, event);
    queryClient.setQueryData(key, next);
    queryClient.setQueryData(runsKey, (existing: ReadonlyArray<RunSummary> | undefined) =>
      mergeRunSummaryList(existing, toRunSummary(next)),
    );
    return;
  }

  if (event.kind === "runSaved") {
    const next = reduceWorkflowEventIntoPersistedRunState(undefined, event);
    queryClient.setQueryData(key, next);
    queryClient.setQueryData(runsKey, (existing: ReadonlyArray<RunSummary> | undefined) =>
      mergeRunSummaryList(existing, toRunSummary(next)),
    );
    return;
  }

  const current = queryClient.getQueryData<PersistedRunState>(key);
  const nextRunState = reduceWorkflowEventIntoPersistedRunState(current, event);
  queryClient.setQueryData(key, nextRunState);
  if (
    event.kind !== "connectionInvocationStarted" &&
    event.kind !== "connectionInvocationCompleted" &&
    event.kind !== "connectionInvocationFailed"
  ) {
    queryClient.setQueryData(runsKey, (existing: ReadonlyArray<RunSummary> | undefined) =>
      mergeRunSummaryList(existing, toRunSummary(nextRunState)),
    );
  }
}

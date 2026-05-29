import type { QueryClient } from "@tanstack/react-query";

import { RunFinishedAtFactory } from "@codemation/core/browser";

import type {
  ConnectionInvocationRecord,
  Items,
  NodeExecutionSnapshot,
  PersistedRunState,
  RunSummary,
  WorkflowEvent,
} from "./realtimeDomainTypes";
import { runQueryKey, workflowRunsQueryKey } from "./realtimeQueryKeys";

export const SNAPSHOT_STATUS_RANK: Readonly<Record<NodeExecutionSnapshot["status"], number>> = {
  pending: 0,
  queued: 1,
  running: 2,
  completed: 3,
  skipped: 3,
  // HITL terminal outcomes rank alongside their non-HITL equivalents: approved/
  // auto-accepted are success-terminal (like completed); rejected/timeout/cancelled
  // are failure-terminal (like failed).
  "hitl-approved": 3,
  "hitl-auto-accepted": 3,
  failed: 4,
  "hitl-rejected": 4,
  "hitl-timeout": 4,
  "hitl-cancelled": 4,
};

export function mergeItemRecordsMonotonic(
  nodeId: string,
  fieldName: "outputs" | "inputsByPort",
  prev: Readonly<Record<string, Items>> | undefined,
  next: Readonly<Record<string, Items>> | undefined,
): Readonly<Record<string, Items>> | undefined {
  if (!prev && !next) return undefined;
  if (!prev) return next;
  if (!next) return prev;
  const merged: Record<string, Items> = { ...next };
  for (const [port, prevItems] of Object.entries(prev)) {
    const nextItems = next[port];
    if (prevItems.length > 0 && (!nextItems || nextItems.length === 0)) {
      console.warn(`[realtime-clamp] kept ${fieldName}[${port}] for node=${nodeId} (incoming was empty)`);
      merged[port] = prevItems;
    }
  }
  return merged;
}

export function recordsAreCanvasEquivalent(
  a: Readonly<Record<string, Items>> | undefined,
  b: Readonly<Record<string, Items>> | undefined,
): boolean {
  const aNonEmpty = Object.entries(a ?? {}).filter(([, items]) => items.length > 0);
  const bNonEmpty = Object.entries(b ?? {}).filter(([, items]) => items.length > 0);
  if (aNonEmpty.length !== bNonEmpty.length) return false;
  const bMap = new Map(bNonEmpty.map(([k, v]) => [k, v.length]));
  for (const [k, v] of aNonEmpty) {
    if (bMap.get(k) !== v.length) return false;
  }
  return true;
}

export function mergeSnapshotMonotonic(
  prev: NodeExecutionSnapshot | undefined,
  next: NodeExecutionSnapshot,
): NodeExecutionSnapshot {
  if (prev === undefined) return next;

  const prevRank = SNAPSHOT_STATUS_RANK[prev.status];
  const nextRank = SNAPSHOT_STATUS_RANK[next.status];
  let clampedStatus = next.status;
  if (nextRank < prevRank) {
    console.warn(
      `[realtime-clamp] kept status=${prev.status} for node=${prev.nodeId} (new event would have regressed to ${next.status})`,
    );
    clampedStatus = prev.status;
  }

  const mergedOutputs = mergeItemRecordsMonotonic(next.nodeId, "outputs", prev.outputs, next.outputs);
  const mergedInputsByPort = mergeItemRecordsMonotonic(
    next.nodeId,
    "inputsByPort",
    prev.inputsByPort,
    next.inputsByPort,
  );

  // Return prev reference if canvas-visible state is unchanged
  if (
    clampedStatus === prev.status &&
    recordsAreCanvasEquivalent(mergedOutputs, prev.outputs) &&
    recordsAreCanvasEquivalent(mergedInputsByPort, prev.inputsByPort)
  ) {
    return prev;
  }

  return { ...next, status: clampedStatus, outputs: mergedOutputs, inputsByPort: mergedInputsByPort };
}

export function mergeRunSavedStateMonotonic(
  current: PersistedRunState | undefined,
  newState: PersistedRunState,
): PersistedRunState {
  if (!current) return newState;
  const currentMap = current.nodeSnapshotsByNodeId ?? {};
  const newMap = newState.nodeSnapshotsByNodeId ?? {};
  const mergedEntries: Record<string, NodeExecutionSnapshot> = {};
  let allPrevRefs = true;

  for (const [nodeId, newSnapshot] of Object.entries(newMap)) {
    const prevSnapshot = currentMap[nodeId];
    const merged = mergeSnapshotMonotonic(prevSnapshot, newSnapshot);
    mergedEntries[nodeId] = merged;
    if (merged !== prevSnapshot) allPrevRefs = false;
  }
  for (const nodeId of Object.keys(currentMap)) {
    if (!(nodeId in newMap)) {
      allPrevRefs = false;
    }
  }

  const stableMap =
    allPrevRefs && Object.keys(mergedEntries).length === Object.keys(currentMap).length ? currentMap : mergedEntries;

  return { ...newState, nodeSnapshotsByNodeId: stableMap };
}

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
    return mergeRunSavedStateMonotonic(current, event.state);
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

  const prevSnapshot = base.nodeSnapshotsByNodeId?.[event.snapshot.nodeId];
  const mergedSnapshot = mergeSnapshotMonotonic(prevSnapshot, event.snapshot);
  const nextNodeSnapshots =
    mergedSnapshot === prevSnapshot && prevSnapshot !== undefined
      ? base.nodeSnapshotsByNodeId
      : {
          ...(base.nodeSnapshotsByNodeId ?? {}),
          [event.snapshot.nodeId]: mergedSnapshot,
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
  // Suite-level test events (`testSuiteStarted`, `testSuiteFinished`) carry `testSuiteRunId`
  // and `workflowId` but no `runId` — they describe the SUITE, not a specific child run, so
  // ignore them here and let the Tests-tab queries pick them up. (The per-case `testCaseStarted`
  // / `testCaseCompleted` events DO have `runId` and flow through normally.)
  const eventRunId = (event as { runId?: string }).runId;
  if (typeof eventRunId !== "string" || eventRunId.length === 0) {
    return;
  }
  const key = runQueryKey(eventRunId);
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
    const current = queryClient.getQueryData<PersistedRunState>(key);
    const next = reduceWorkflowEventIntoPersistedRunState(current, event);
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

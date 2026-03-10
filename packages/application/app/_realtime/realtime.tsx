"use client";

import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import type { Logger } from "../_logging/loggerFactory";

export type JsonItem = Readonly<{
  json: unknown;
  meta?: Readonly<Record<string, unknown>>;
  paired?: ReadonlyArray<Readonly<{ nodeId: string; output: string; itemIndex: number }>>;
}>;

export type Items = ReadonlyArray<JsonItem>;

export type WorkflowSummary = Readonly<{ id: string; name: string }>;

export type WorkflowDto = Readonly<{
  id: string;
  name: string;
  nodes: ReadonlyArray<Readonly<{ id: string; kind: string; name?: string; type: string }>>;
  edges: ReadonlyArray<
    Readonly<{
      from: Readonly<{ nodeId: string; output: string }>;
      to: Readonly<{ nodeId: string; input: string }>;
    }>
  >;
}>;

export type ParentExecutionRef = Readonly<{ runId: string; workflowId: string; nodeId: string }>;

export type RunSummary = Readonly<{
  runId: string;
  workflowId: string;
  startedAt: string;
  status: string;
  parent?: ParentExecutionRef;
}>;

export type NodeExecutionSnapshot = Readonly<{
  runId: string;
  workflowId: string;
  nodeId: string;
  activationId?: string;
  parent?: ParentExecutionRef;
  status: "pending" | "queued" | "running" | "completed" | "failed";
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  inputsByPort?: Readonly<Record<string, Items>>;
  outputs?: Readonly<Record<string, Items>>;
  error?: Readonly<{ message: string }>;
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
  status: "running" | "pending" | "completed" | "failed";
  pending?: PendingNodeExecution;
  queue: ReadonlyArray<unknown>;
  outputsByNode: Readonly<Record<string, Readonly<Record<string, Items>>>>;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
}>;

export type WorkflowEvent =
  | Readonly<{ kind: "runCreated"; runId: string; workflowId: string; parent?: ParentExecutionRef; at: string }>
  | Readonly<{ kind: "runSaved"; runId: string; workflowId: string; parent?: ParentExecutionRef; at: string; state: PersistedRunState }>
  | Readonly<{ kind: "nodeQueued"; runId: string; workflowId: string; parent?: ParentExecutionRef; at: string; snapshot: NodeExecutionSnapshot }>
  | Readonly<{ kind: "nodeStarted"; runId: string; workflowId: string; parent?: ParentExecutionRef; at: string; snapshot: NodeExecutionSnapshot }>
  | Readonly<{ kind: "nodeCompleted"; runId: string; workflowId: string; parent?: ParentExecutionRef; at: string; snapshot: NodeExecutionSnapshot }>
  | Readonly<{ kind: "nodeFailed"; runId: string; workflowId: string; parent?: ParentExecutionRef; at: string; snapshot: NodeExecutionSnapshot }>;

type RealtimeServerMessage =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "subscribed"; workflowId: string }>
  | Readonly<{ kind: "unsubscribed"; workflowId: string }>
  | Readonly<{ kind: "event"; event: WorkflowEvent }>
  | Readonly<{ kind: "error"; message: string }>;

type RealtimeClientMessage =
  | Readonly<{ kind: "subscribeWorkflow"; workflowId: string }>
  | Readonly<{ kind: "unsubscribeWorkflow"; workflowId: string }>;

type RealtimeContextValue = Readonly<{
  retainWorkflowSubscription: (workflowId: string) => () => void;
  isConnected: boolean;
}>;

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const workflowsQueryKey = ["workflows"] as const;
const workflowQueryKey = (workflowId: string) => ["workflow", workflowId] as const;
const workflowRunsQueryKey = (workflowId: string) => ["workflow-runs", workflowId] as const;
const runQueryKey = (runId: string) => ["run", runId] as const;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function fetchWorkflows(): Promise<ReadonlyArray<WorkflowSummary>> {
  return await fetchJson<ReadonlyArray<WorkflowSummary>>("/api/workflows");
}

async function fetchWorkflow(workflowId: string): Promise<WorkflowDto> {
  return await fetchJson<WorkflowDto>(`/api/workflows/${encodeURIComponent(workflowId)}`);
}

async function fetchWorkflowRuns(workflowId: string): Promise<ReadonlyArray<RunSummary>> {
  return await fetchJson<ReadonlyArray<RunSummary>>(`/api/workflows/${encodeURIComponent(workflowId)}/runs`);
}

async function fetchRun(runId: string): Promise<PersistedRunState> {
  return await fetchJson<PersistedRunState>(`/api/runs/${encodeURIComponent(runId)}`);
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
    parent: state.parent,
  };
}

function mergeRunSummaryList(existing: ReadonlyArray<RunSummary> | undefined, summary: RunSummary): ReadonlyArray<RunSummary> {
  const current = [...(existing ?? [])];
  const index = current.findIndex((entry) => entry.runId === summary.runId);
  if (index >= 0) current[index] = summary;
  else current.unshift(summary);
  current.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return current;
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

  return {
    ...base,
    parent: base.parent ?? event.parent,
    status: event.kind === "nodeFailed" ? "failed" : event.kind === "nodeCompleted" ? base.status : "pending",
    pending: nextPending,
    outputsByNode: nextOutputsByNode,
    nodeSnapshotsByNodeId: nextNodeSnapshots,
  };
}

function applyWorkflowEvent(queryClient: QueryClient, event: WorkflowEvent): void {
  if (event.kind === "runCreated") {
    const initialRunState = createInitialRunState(event);
    queryClient.setQueryData(runQueryKey(event.runId), initialRunState);
    queryClient.setQueryData(workflowRunsQueryKey(event.workflowId), (existing: ReadonlyArray<RunSummary> | undefined) =>
      mergeRunSummaryList(existing, toRunSummary(initialRunState)),
    );
    return;
  }

  if (event.kind === "runSaved") {
    queryClient.setQueryData(runQueryKey(event.runId), event.state);
    queryClient.setQueryData(workflowRunsQueryKey(event.workflowId), (existing: ReadonlyArray<RunSummary> | undefined) =>
      mergeRunSummaryList(existing, toRunSummary(event.state)),
    );
    return;
  }

  const nextRunState = mergeSnapshotIntoRunState(queryClient.getQueryData<PersistedRunState>(runQueryKey(event.runId)), event);
  queryClient.setQueryData(runQueryKey(event.runId), nextRunState);
  queryClient.setQueryData(workflowRunsQueryKey(event.workflowId), (existing: ReadonlyArray<RunSummary> | undefined) =>
    mergeRunSummaryList(existing, toRunSummary(nextRunState)),
  );
}

export function WorkflowRealtimeProvider(args: { children: ReactNode; websocketUrl: string; logger: Logger }) {
  const { children, websocketUrl, logger } = args;
  const queryClient = useQueryClient();
  const desiredWorkflowCountsRef = useRef(new Map<string, number>());
  const readyStateRef = useRef(ReadyState.UNINSTANTIATED);
  const sendJsonMessageRef = useRef<(message: RealtimeClientMessage) => void>(() => {
    throw new Error("sendJsonMessage is not ready");
  });
  const [activeWorkflowIds, setActiveWorkflowIds] = useState<ReadonlyArray<string>>([]);
  const shouldConnect = activeWorkflowIds.length > 0;
  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket<RealtimeServerMessage>(websocketUrl, {
    share: true,
    shouldReconnect: () => true,
    reconnectAttempts: Number.POSITIVE_INFINITY,
    retryOnError: true,
    onOpen: () => {
      logger.info(`websocket transport opened to ${websocketUrl}`);
    },
    onClose: (event) => {
      logger.warn(`websocket transport closed code=${event.code} reason=${event.reason || "no-reason"} clean=${event.wasClean}`);
    },
    onError: () => {
      logger.error(`websocket transport error for ${websocketUrl}`);
    },
  }, shouldConnect);

  readyStateRef.current = readyState;
  sendJsonMessageRef.current = sendJsonMessage;

  useEffect(() => {
    if (!lastJsonMessage) return;

    if (lastJsonMessage.kind === "event") {
      logger.debug(`received websocket event ${lastJsonMessage.event.kind}:${lastJsonMessage.event.workflowId}`);
      applyWorkflowEvent(queryClient, lastJsonMessage.event);
      return;
    }

    if (lastJsonMessage.kind === "subscribed") {
      logger.info(`subscribed to workflow ${lastJsonMessage.workflowId}`);
      return;
    }

    if (lastJsonMessage.kind === "unsubscribed") {
      logger.info(`unsubscribed from workflow ${lastJsonMessage.workflowId}`);
      return;
    }

    if (lastJsonMessage.kind === "error") {
      logger.error(`websocket error message: ${lastJsonMessage.message}`);
      return;
    }

    logger.debug(`websocket control message ${lastJsonMessage.kind}`);
  }, [lastJsonMessage, logger, queryClient]);

  useEffect(() => {
    if (!shouldConnect) {
      logger.debug("websocket connect disabled because there are no active workflow subscriptions");
      return;
    }
    logger.info(`websocket readyState changed to ${ReadyState[readyState] ?? readyState}`);
  }, [logger, readyState, shouldConnect]);

  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    for (const workflowId of desiredWorkflowCountsRef.current.keys()) {
      sendJsonMessage({ kind: "subscribeWorkflow", workflowId } satisfies RealtimeClientMessage);
      logger.debug(`sent subscribe for workflow ${workflowId}`);
    }
  }, [logger, readyState, sendJsonMessage]);

  const retainWorkflowSubscription = useCallback(
    (workflowId: string) => {
      const nextCount = (desiredWorkflowCountsRef.current.get(workflowId) ?? 0) + 1;
      desiredWorkflowCountsRef.current.set(workflowId, nextCount);
      setActiveWorkflowIds((current) => {
        const next = [...desiredWorkflowCountsRef.current.keys()];
        return current.length === next.length && current.every((value, index) => value === next[index]) ? current : next;
      });
      if (nextCount === 1 && readyStateRef.current === ReadyState.OPEN) {
        sendJsonMessageRef.current({ kind: "subscribeWorkflow", workflowId } satisfies RealtimeClientMessage);
        logger.debug(`retain subscription sent immediately for workflow ${workflowId}`);
      }

      return () => {
        const currentCount = desiredWorkflowCountsRef.current.get(workflowId) ?? 0;
        if (currentCount <= 1) {
          desiredWorkflowCountsRef.current.delete(workflowId);
          setActiveWorkflowIds((current) => {
            const next = [...desiredWorkflowCountsRef.current.keys()];
            return current.length === next.length && current.every((value, index) => value === next[index]) ? current : next;
          });
          if (readyStateRef.current === ReadyState.OPEN) {
            sendJsonMessageRef.current({ kind: "unsubscribeWorkflow", workflowId } satisfies RealtimeClientMessage);
            logger.debug(`sent unsubscribe for workflow ${workflowId}`);
          }
          return;
        }
        desiredWorkflowCountsRef.current.set(workflowId, currentCount - 1);
        setActiveWorkflowIds((current) => {
          const next = [...desiredWorkflowCountsRef.current.keys()];
          return current.length === next.length && current.every((value, index) => value === next[index]) ? current : next;
        });
      };
    },
    [logger],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({
      retainWorkflowSubscription,
      isConnected: readyState === ReadyState.OPEN,
    }),
    [readyState, retainWorkflowSubscription],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useWorkflowRealtimeSubscription(workflowId: string | null | undefined): void {
  const retainWorkflowSubscription = useContext(RealtimeContext)?.retainWorkflowSubscription;

  useEffect(() => {
    if (!retainWorkflowSubscription || !workflowId) return;
    return retainWorkflowSubscription(workflowId);
  }, [retainWorkflowSubscription, workflowId]);
}

export function useWorkflowsQuery() {
  return useQuery({
    queryKey: workflowsQueryKey,
    queryFn: fetchWorkflows,
  });
}

export function useWorkflowQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowQueryKey(workflowId),
    queryFn: async () => await fetchWorkflow(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useWorkflowRunsQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowRunsQueryKey(workflowId),
    queryFn: async () => await fetchWorkflowRuns(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useRunQuery(runId: string | null | undefined) {
  return useQuery({
    queryKey: runId ? runQueryKey(runId) : ["run", "disabled"],
    queryFn: async () => await fetchRun(runId!),
    enabled: Boolean(runId),
  });
}

export function useRunStateFromCache(runId: string | null | undefined): PersistedRunState | undefined {
  const queryClient = useQueryClient();
  return useMemo(() => {
    if (!runId) return undefined;
    return queryClient.getQueryData<PersistedRunState>(runQueryKey(runId));
  }, [queryClient, runId]);
}

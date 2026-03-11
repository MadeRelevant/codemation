"use client";

import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Logger } from "../logging/LoggerFactory";

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
  nodes: ReadonlyArray<Readonly<{ id: string; kind: string; name?: string; type: string; role?: string; icon?: string; parentNodeId?: string }>>;
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
  error?: Readonly<{ message: string; name?: string; stack?: string }>;
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
  | Readonly<{ kind: "workflowChanged"; workflowId: string }>
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

type RetainWorkflowSubscription = RealtimeContextValue["retainWorkflowSubscription"];

type RealtimeBridgeState = {
  retainWorkflowSubscription: RetainWorkflowSubscription | null;
  listeners: Set<() => void>;
};

type RealtimeBridgeGlobal = typeof globalThis & {
  __codemationRealtimeBridge__?: RealtimeBridgeState;
};

const RealtimeReadyState = {
  UNINSTANTIATED: -1,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

type RealtimeReadyState = (typeof RealtimeReadyState)[keyof typeof RealtimeReadyState];

const workflowsQueryKey = ["workflows"] as const;
const workflowQueryKey = (workflowId: string) => ["workflow", workflowId] as const;
const workflowRunsQueryKey = (workflowId: string) => ["workflow-runs", workflowId] as const;
const runQueryKey = (runId: string) => ["run", runId] as const;

function getRealtimeBridge(): RealtimeBridgeState {
  const realtimeGlobal = globalThis as RealtimeBridgeGlobal;
  if (!realtimeGlobal.__codemationRealtimeBridge__) {
    realtimeGlobal.__codemationRealtimeBridge__ = {
      retainWorkflowSubscription: null,
      listeners: new Set(),
    };
  }
  return realtimeGlobal.__codemationRealtimeBridge__;
}

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

export function WorkflowRealtimeProvider(args: { children: ReactNode; logger: Logger; websocketPort?: string }) {
  const { children, logger, websocketPort } = args;
  const queryClient = useQueryClient();
  const desiredWorkflowCountsRef = useRef(new Map<string, number>());
  const pendingJsonMessagesRef = useRef<RealtimeServerMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const readyStateRef = useRef<RealtimeReadyState>(RealtimeReadyState.UNINSTANTIATED);
  const hasOpenedConnectionRef = useRef(false);
  const hasLoggedUnavailableTransportRef = useRef(false);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const lastWarmupAtRef = useRef(0);
  const [readyState, setReadyState] = useState<RealtimeReadyState>(RealtimeReadyState.UNINSTANTIATED);
  const [messageQueueVersion, setMessageQueueVersion] = useState(0);
  const sendJsonMessageRef = useRef<(message: RealtimeClientMessage) => void>(() => {
    throw new Error("sendJsonMessage is not ready");
  });
  const [activeWorkflowIds, setActiveWorkflowIds] = useState<ReadonlyArray<string>>([]);
  const [isTransportReady, setIsTransportReady] = useState(false);
  const websocketUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const port = websocketPort ?? window.location.port;
    const host = `${window.location.hostname}${port ? `:${port}` : ""}`;
    return `${protocol}://${host}/api/workflows/ws`;
  }, [websocketPort]);
  const shouldConnect = isTransportReady && Boolean(websocketUrl);

  readyStateRef.current = readyState;
  const handleRealtimeServerMessage = useCallback(
    (message: RealtimeServerMessage) => {
      if (message.kind === "event") {
        const eventDetails = "snapshot" in message.event && message.event.snapshot ? `:${message.event.snapshot.nodeId}:${message.event.snapshot.status}` : "";
        if ("snapshot" in message.event && message.event.snapshot) {
          logger.info(`realtime snapshot event node=${message.event.snapshot.nodeId} kind=${message.event.kind}`);
        }
        logger.debug(`received websocket event ${message.event.kind}:${message.event.workflowId}${eventDetails}`);
        applyWorkflowEvent(queryClient, message.event);
        return;
      }

      if (message.kind === "subscribed") {
        logger.info(`subscribed to workflow ${message.workflowId}`);
        return;
      }

      if (message.kind === "unsubscribed") {
        logger.info(`unsubscribed from workflow ${message.workflowId}`);
        return;
      }

      if (message.kind === "workflowChanged") {
        logger.info(`workflow changed ${message.workflowId}`);
        void queryClient.invalidateQueries({ queryKey: workflowQueryKey(message.workflowId) });
        void queryClient.invalidateQueries({ queryKey: workflowsQueryKey });
        void queryClient.refetchQueries({ queryKey: workflowQueryKey(message.workflowId), type: "active" });
        return;
      }

      if (message.kind === "error") {
        logger.error(`websocket error message: ${message.message}`);
        return;
      }

      logger.debug(`websocket control message ${message.kind}`);
    },
    [logger, queryClient],
  );
  const sendJsonMessage = useCallback((message: RealtimeClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      throw new Error("sendJsonMessage is not ready");
    }
    socketRef.current.send(JSON.stringify(message));
  }, []);
  const canSendJsonMessage = useCallback((): boolean => socketRef.current?.readyState === WebSocket.OPEN, []);
  sendJsonMessageRef.current = sendJsonMessage;

  const warmupRealtimeTransport = useCallback(async (): Promise<void> => {
    const now = Date.now();
    if (warmupPromiseRef.current) {
      await warmupPromiseRef.current;
      return;
    }
    if (now - lastWarmupAtRef.current < 500) {
      return;
    }
    lastWarmupAtRef.current = now;
    const warmupPromise = (async () => {
      logger.info("warming realtime transport");
      const response = await fetch("/api/realtime/ready", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setIsTransportReady(true);
      logger.info("realtime transport warmed");
    })();
    warmupPromiseRef.current = warmupPromise;
    try {
      await warmupPromise;
    } catch (error) {
      setIsTransportReady(false);
      const exception = error instanceof Error ? error : new Error(String(error));
      logger.warn(`failed to warm realtime transport: ${exception.message}`);
    } finally {
      if (warmupPromiseRef.current === warmupPromise) {
        warmupPromiseRef.current = null;
      }
    }
  }, [logger]);

  useEffect(() => {
    if (!shouldConnect || !websocketUrl) {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
      setReadyState(RealtimeReadyState.UNINSTANTIATED);
      return;
    }

    let disposed = false;
    const connect = () => {
      if (disposed) {
        return;
      }
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setReadyState(RealtimeReadyState.CONNECTING);
      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed || socketRef.current !== socket) {
          return;
        }
        hasOpenedConnectionRef.current = true;
        hasLoggedUnavailableTransportRef.current = false;
        setReadyState(RealtimeReadyState.OPEN);
        logger.info(`websocket transport opened to ${websocketUrl}`);
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        try {
          pendingJsonMessagesRef.current.push(JSON.parse(event.data) as RealtimeServerMessage);
          setMessageQueueVersion((current) => current + 1);
        } catch (error) {
          const exception = error instanceof Error ? error : new Error(String(error));
          logger.error(`failed to parse websocket message for ${websocketUrl}: ${exception.message}`);
        }
      });

      socket.addEventListener("error", () => {
        if (!hasOpenedConnectionRef.current && !hasLoggedUnavailableTransportRef.current) {
          hasLoggedUnavailableTransportRef.current = true;
          logger.debug(`websocket transport is not available yet at ${websocketUrl}`);
          return;
        }
        logger.error(`websocket transport error for ${websocketUrl}`);
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setIsTransportReady(false);
        setReadyState(RealtimeReadyState.CLOSED);
        if (!hasOpenedConnectionRef.current && !hasLoggedUnavailableTransportRef.current) {
          hasLoggedUnavailableTransportRef.current = true;
          logger.debug(`websocket transport is not available yet at ${websocketUrl}`);
          return;
        }
        logger.warn(`websocket transport closed code=${event.code} reason=${event.reason || "no-reason"} clean=${event.wasClean}`);
        if (disposed) {
          return;
        }
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, 1000);
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (socketRef.current) {
        setReadyState(RealtimeReadyState.CLOSING);
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [logger, shouldConnect, websocketUrl]);

  useEffect(() => {
    if (pendingJsonMessagesRef.current.length === 0) {
      return;
    }
    const messages = pendingJsonMessagesRef.current.splice(0, pendingJsonMessagesRef.current.length);
    for (const message of messages) {
      handleRealtimeServerMessage(message);
    }
  }, [handleRealtimeServerMessage, messageQueueVersion]);

  useEffect(() => {
    if (readyState === RealtimeReadyState.OPEN) {
      logger.info("websocket readyState changed to OPEN");
      return;
    }
    if (readyState === RealtimeReadyState.CLOSED && hasOpenedConnectionRef.current) {
      logger.warn("websocket readyState changed to CLOSED");
    }
  }, [logger, readyState]);

  useEffect(() => {
    if (!websocketUrl || (isTransportReady && readyState === RealtimeReadyState.OPEN)) {
      return;
    }
    void warmupRealtimeTransport();
  }, [isTransportReady, readyState, warmupRealtimeTransport, websocketUrl]);

  useEffect(() => {
    if (readyState !== RealtimeReadyState.OPEN) return;
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
      if (nextCount === 1 && readyStateRef.current === RealtimeReadyState.OPEN && canSendJsonMessage()) {
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
          if (readyStateRef.current === RealtimeReadyState.OPEN && canSendJsonMessage()) {
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
    [canSendJsonMessage, logger],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({
      retainWorkflowSubscription,
      isConnected: readyState === RealtimeReadyState.OPEN,
    }),
    [readyState, retainWorkflowSubscription],
  );

  useEffect(() => {
    const bridge = getRealtimeBridge();
    bridge.retainWorkflowSubscription = retainWorkflowSubscription;
    for (const listener of bridge.listeners) {
      listener();
    }
    return () => {
      if (bridge.retainWorkflowSubscription === retainWorkflowSubscription) {
        bridge.retainWorkflowSubscription = null;
      }
      for (const listener of bridge.listeners) {
        listener();
      }
    };
  }, [retainWorkflowSubscription]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useWorkflowRealtimeSubscription(workflowId: string | null | undefined): void {
  const [bridgeVersion, setBridgeVersion] = useState(0);
  const retainWorkflowSubscription =
    useContext(RealtimeContext)?.retainWorkflowSubscription ?? getRealtimeBridge().retainWorkflowSubscription;

  useEffect(() => {
    const bridge = getRealtimeBridge();
    const handleBridgeUpdate = () => {
      setBridgeVersion((current) => current + 1);
    };
    bridge.listeners.add(handleBridgeUpdate);
    return () => {
      bridge.listeners.delete(handleBridgeUpdate);
    };
  }, []);

  useEffect(() => {
    if (!retainWorkflowSubscription || !workflowId) return;
    return retainWorkflowSubscription(workflowId);
  }, [bridgeVersion, retainWorkflowSubscription, workflowId]);
}

export function useWorkflowsQuery() {
  return useWorkflowsQueryWithInitialData();
}

export function useWorkflowsQueryWithInitialData(initialData?: ReadonlyArray<WorkflowSummary>) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: workflowsQueryKey,
    queryFn: fetchWorkflows,
    initialData,
  });
  useEffect(() => {
    if (!initialData) return;
    queryClient.setQueryData(workflowsQueryKey, initialData);
  }, [initialData, queryClient]);
  return query;
}

export function useWorkflowQuery(workflowId: string, initialData?: WorkflowDto) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: workflowQueryKey(workflowId),
    queryFn: async () => await fetchWorkflow(workflowId),
    enabled: Boolean(workflowId),
    initialData,
  });
  useEffect(() => {
    if (!workflowId || !initialData) return;
    queryClient.setQueryData(workflowQueryKey(workflowId), initialData);
  }, [initialData, queryClient, workflowId]);
  return query;
}

export function useWorkflowRunsQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowRunsQueryKey(workflowId),
    queryFn: async () => await fetchWorkflowRuns(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useRunQuery(runId: string | null | undefined) {
  const queryClient = useQueryClient();
  const cachedState = useMemo(() => {
    if (!runId) return undefined;
    return queryClient.getQueryData<PersistedRunState>(runQueryKey(runId));
  }, [queryClient, runId]);

  return useQuery({
    queryKey: runId ? runQueryKey(runId) : ["run", "disabled"],
    queryFn: async () => await fetchRun(runId!),
    enabled: Boolean(runId) && !cachedState,
    initialData: cachedState,
  });
}

export function useRunStateFromCache(runId: string | null | undefined): PersistedRunState | undefined {
  const queryClient = useQueryClient();
  return useMemo(() => {
    if (!runId) return undefined;
    return queryClient.getQueryData<PersistedRunState>(runQueryKey(runId));
  }, [queryClient, runId]);
}

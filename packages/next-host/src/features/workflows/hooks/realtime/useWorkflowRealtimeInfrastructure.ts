import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import type { Logger } from "@codemation/host-src/application/logging/Logger";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RealtimeContextValue } from "../../components/realtime/RealtimeContext";
import { applyWorkflowEvent } from "../../lib/realtime/realtimeRunMutations";
import {
  getRealtimeBridge,
  minimumRealtimeActiveVisibilityMs,
  persistentRealtimeDisconnectWarningDelayMs,
  RealtimeReadyState,
  type RealtimeClientMessage,
  type RealtimeReadyValue,
  type RealtimeServerMessage,
} from "../../lib/realtime/realtimeClientBridge";
import {
  runQueryKey,
  workflowDevBuildStateQueryKey,
  workflowQueryKey,
  workflowsQueryKey,
} from "../../lib/realtime/realtimeQueryKeys";
import type { PersistedRunState, WorkflowDevBuildState } from "../../lib/realtime/realtimeDomainTypes";

export function useWorkflowRealtimeInfrastructure(
  args: Readonly<{ logger: Logger; websocketPort?: string }>,
): RealtimeContextValue {
  const { logger, websocketPort } = args;
  const queryClient = useQueryClient();
  const [workflowSocketEnabled, setWorkflowSocketEnabled] = useState(false);
  const hasLoggedWorkflowSocketEnabledRef = useRef(false);
  const desiredWorkflowCountsRef = useRef(new Map<string, number>());
  const pendingOutgoingMessagesRef = useRef<RealtimeClientMessage[]>([]);
  const activeStatusShownAtByNodeKeyRef = useRef(new Map<string, number>());
  const terminalEventTimeoutIdByNodeKeyRef = useRef(new Map<string, number>());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const disconnectWarningTimeoutRef = useRef<number | null>(null);
  const readyStateRef = useRef<RealtimeReadyValue>(RealtimeReadyState.UNINSTANTIATED);
  const hasOpenedConnectionRef = useRef(false);
  const hasLoggedUnavailableTransportRef = useRef(false);
  const hasLoggedPersistentTransportUnavailableRef = useRef(false);
  const pendingDisconnectReasonRef = useRef<string | null>(null);
  const [readyState, setReadyState] = useState<RealtimeReadyValue>(RealtimeReadyState.UNINSTANTIATED);
  const sendJsonMessageRef = useRef<(message: RealtimeClientMessage) => boolean>(() => false);
  const [, setActiveWorkflowIds] = useState<ReadonlyArray<string>>([]);
  const websocketUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const port = websocketPort ?? window.location.port;
    const host = `${window.location.hostname}${port !== undefined && port !== "" ? `:${port}` : ""}`;
    return `${protocol}://${host}${ApiPaths.workflowWebsocket()}`;
  }, [websocketPort]);
  const devGatewayWebsocketUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const port = websocketPort ?? window.location.port;
    const host = `${window.location.hostname}${port !== undefined && port !== "" ? `:${port}` : ""}`;
    return `${protocol}://${host}${ApiPaths.devGatewaySocket()}`;
  }, [websocketPort]);
  const shouldConnect = Boolean(websocketUrl) && workflowSocketEnabled;

  readyStateRef.current = readyState;
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let disposed = false;
    let intervalId: number | null = null;
    const check = async (): Promise<boolean> => {
      try {
        const response = await fetch("/api/dev/health", { cache: "no-store" });
        if (response.status !== 200) {
          setWorkflowSocketEnabled(true);
          return true;
        }
        const json = (await response.json().catch(() => null)) as Readonly<{
          runtime?: Readonly<{ status?: unknown }>;
        }> | null;
        const status = json?.runtime?.status;
        if (status === "ready") {
          setWorkflowSocketEnabled(true);
          return true;
        }
        setWorkflowSocketEnabled(false);
        return false;
      } catch {
        // Non-dev environments or transient failures should not disable realtime.
        setWorkflowSocketEnabled(true);
        return true;
      }
    };
    void (async () => {
      const ready = await check();
      if (disposed || ready) {
        return;
      }
      intervalId = window.setInterval(() => {
        void (async () => {
          const nextReady = await check();
          if (!nextReady || disposed || intervalId === null) {
            return;
          }
          window.clearInterval(intervalId);
          intervalId = null;
        })();
      }, 500);
    })();
    return () => {
      disposed = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);
  useEffect(() => {
    if (workflowSocketEnabled && !hasLoggedWorkflowSocketEnabledRef.current) {
      hasLoggedWorkflowSocketEnabledRef.current = true;
      logger.info(`workflow websocket enabled port=${websocketPort ?? window.location.port}`);
    }
  }, [logger, websocketPort, workflowSocketEnabled]);
  const clearPendingDisconnectWarning = useCallback((): void => {
    if (disconnectWarningTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(disconnectWarningTimeoutRef.current);
    disconnectWarningTimeoutRef.current = null;
  }, []);
  const schedulePersistentDisconnectWarning = useCallback(
    (reason: string): void => {
      pendingDisconnectReasonRef.current = reason;
      if (disconnectWarningTimeoutRef.current !== null) {
        return;
      }
      disconnectWarningTimeoutRef.current = window.setTimeout(() => {
        disconnectWarningTimeoutRef.current = null;
        if (readyStateRef.current === RealtimeReadyState.OPEN) {
          pendingDisconnectReasonRef.current = null;
          return;
        }
        if (hasLoggedPersistentTransportUnavailableRef.current) {
          return;
        }
        hasLoggedPersistentTransportUnavailableRef.current = true;
        logger.warn(
          `websocket transport is still unavailable after ${persistentRealtimeDisconnectWarningDelayMs}ms at ${websocketUrl}: ${pendingDisconnectReasonRef.current ?? reason}`,
        );
      }, persistentRealtimeDisconnectWarningDelayMs);
    },
    [logger, websocketUrl],
  );
  const clearPendingTerminalEventDelay = useCallback((nodeKey: string): void => {
    const timeoutId = terminalEventTimeoutIdByNodeKeyRef.current.get(nodeKey);
    if (timeoutId === undefined) return;
    window.clearTimeout(timeoutId);
    terminalEventTimeoutIdByNodeKeyRef.current.delete(nodeKey);
  }, []);
  const clearRunRealtimeDelays = useCallback(
    (runId: string): void => {
      const runPrefix = `${runId}:`;
      for (const nodeKey of terminalEventTimeoutIdByNodeKeyRef.current.keys()) {
        if (!nodeKey.startsWith(runPrefix)) continue;
        clearPendingTerminalEventDelay(nodeKey);
      }
      for (const nodeKey of activeStatusShownAtByNodeKeyRef.current.keys()) {
        if (!nodeKey.startsWith(runPrefix)) continue;
        activeStatusShownAtByNodeKeyRef.current.delete(nodeKey);
      }
    },
    [clearPendingTerminalEventDelay],
  );
  const handleRealtimeServerMessage = useCallback(
    (message: RealtimeServerMessage) => {
      if (message.kind === "event") {
        const eventDetails =
          "snapshot" in message.event && message.event.snapshot
            ? `:${message.event.snapshot.nodeId}:${message.event.snapshot.status}`
            : "";
        if ("snapshot" in message.event && message.event.snapshot) {
          logger.info(`realtime snapshot event node=${message.event.snapshot.nodeId} kind=${message.event.kind}`);
        }
        logger.debug(`received websocket event ${message.event.kind}:${message.event.workflowId}${eventDetails}`);
        if (message.event.kind === "runSaved") {
          clearRunRealtimeDelays(message.event.runId);
          applyWorkflowEvent(queryClient, message.event);
          const currentRunState = queryClient.getQueryData<PersistedRunState>(runQueryKey(message.event.runId));
          logger.info(
            `cache after runSaved run=${message.event.runId} status=${currentRunState?.status ?? "missing"} pending=${currentRunState?.pending?.nodeId ?? "no"} snapshots=${Object.entries(
              currentRunState?.nodeSnapshotsByNodeId ?? {},
            )
              .map(([nodeId, snapshot]) => `${nodeId}:${snapshot.status}`)
              .join(",")}`,
          );
          return;
        }
        if (
          message.event.kind === "nodeQueued" ||
          message.event.kind === "nodeStarted" ||
          message.event.kind === "nodeCompleted" ||
          message.event.kind === "nodeFailed"
        ) {
          const nodeKey = `${message.event.runId}:${message.event.snapshot.nodeId}`;
          if (message.event.kind === "nodeQueued" || message.event.kind === "nodeStarted") {
            clearPendingTerminalEventDelay(nodeKey);
            activeStatusShownAtByNodeKeyRef.current.set(nodeKey, Date.now());
            applyWorkflowEvent(queryClient, message.event);
            return;
          }

          const activeStatusShownAt = activeStatusShownAtByNodeKeyRef.current.get(nodeKey);
          if (activeStatusShownAt !== undefined) {
            const remainingVisibilityMs = minimumRealtimeActiveVisibilityMs - (Date.now() - activeStatusShownAt);
            if (remainingVisibilityMs > 0) {
              clearPendingTerminalEventDelay(nodeKey);
              const timeoutId = window.setTimeout(() => {
                activeStatusShownAtByNodeKeyRef.current.delete(nodeKey);
                terminalEventTimeoutIdByNodeKeyRef.current.delete(nodeKey);
                applyWorkflowEvent(queryClient, message.event);
              }, remainingVisibilityMs);
              terminalEventTimeoutIdByNodeKeyRef.current.set(nodeKey, timeoutId);
              return;
            }
          }

          clearPendingTerminalEventDelay(nodeKey);
          activeStatusShownAtByNodeKeyRef.current.delete(nodeKey);
          applyWorkflowEvent(queryClient, message.event);
          const currentRunState = queryClient.getQueryData<PersistedRunState>(runQueryKey(message.event.runId));
          logger.info(
            `cache after ${message.event.kind} run=${message.event.runId} node=${message.event.snapshot.nodeId} status=${currentRunState?.status ?? "missing"} pending=${currentRunState?.pending?.nodeId ?? "no"} nodeStatus=${currentRunState?.nodeSnapshotsByNodeId?.[message.event.snapshot.nodeId]?.status ?? "missing"}`,
          );
          return;
        }
        applyWorkflowEvent(queryClient, message.event);
        return;
      }

      if (message.kind === "subscribed") {
        logger.info(`subscribed to room ${message.roomId}`);
        return;
      }

      if (message.kind === "unsubscribed") {
        logger.info(`unsubscribed from room ${message.roomId}`);
        return;
      }

      if (message.kind === "workflowChanged") {
        logger.info(`workflow changed ${message.workflowId}`);
        const workflowRefreshStarted = performance.now();
        if (process.env.NEXT_PUBLIC_CODEMATION_PERFORMANCE_LOGGING === "true") {
          logger.info(
            `[codemation-dev-timing] workflowChanged received workflowId=${message.workflowId} t=${workflowRefreshStarted.toFixed(1)}`,
          );
        }
        queryClient.setQueryData<WorkflowDevBuildState>(
          workflowDevBuildStateQueryKey(message.workflowId),
          (existing) => ({
            state: "building",
            updatedAt: existing?.updatedAt ?? new Date().toISOString(),
            buildVersion: existing?.buildVersion,
            awaitingWorkflowRefreshAt: new Date().toISOString(),
          }),
        );
        void queryClient.invalidateQueries({ queryKey: workflowQueryKey(message.workflowId) });
        void queryClient.invalidateQueries({ queryKey: workflowsQueryKey });
        void queryClient
          .refetchQueries({ queryKey: workflowQueryKey(message.workflowId), type: "active" })
          .then(() => {
            if (process.env.NEXT_PUBLIC_CODEMATION_PERFORMANCE_LOGGING === "true") {
              logger.info(
                `[codemation-dev-timing] workflow refetch finished workflowId=${message.workflowId} +${(performance.now() - workflowRefreshStarted).toFixed(1)}ms from workflowChanged`,
              );
            }
          })
          .catch(() => {
            // Refetch errors are surfaced via query state; timing log only on success path.
          });
        return;
      }

      if (message.kind === "devBuildStarted") {
        logger.info(`workflow rebuild started ${message.workflowId}`);
        queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey(message.workflowId), {
          state: "building",
          updatedAt: new Date().toISOString(),
          buildVersion: message.buildVersion,
          awaitingWorkflowRefreshAt: new Date().toISOString(),
        });
        return;
      }

      if (message.kind === "devBuildCompleted") {
        logger.info(`workflow rebuild completed ${message.workflowId} revision=${message.buildVersion}`);
        const completedAt = new Date().toISOString();
        queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey(message.workflowId), () => ({
          state: "building",
          updatedAt: completedAt,
          buildVersion: message.buildVersion,
          awaitingWorkflowRefreshAt: completedAt,
        }));
        void queryClient.invalidateQueries({ queryKey: workflowQueryKey(message.workflowId) });
        void queryClient.refetchQueries({ queryKey: workflowQueryKey(message.workflowId), type: "active" });
        return;
      }

      if (message.kind === "devBuildFailed") {
        logger.error(`workflow rebuild failed ${message.workflowId}: ${message.message}`);
        queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey(message.workflowId), {
          state: "failed",
          updatedAt: new Date().toISOString(),
          message: message.message,
          awaitingWorkflowRefreshAt: undefined,
        });
        return;
      }

      if (message.kind === "error") {
        logger.error(`websocket error message: ${message.message}`);
        return;
      }

      logger.debug(`websocket control message ${message.kind}`);
    },
    [clearPendingTerminalEventDelay, clearRunRealtimeDelays, logger, queryClient],
  );
  const handleRealtimeServerMessageRef = useRef(handleRealtimeServerMessage);
  handleRealtimeServerMessageRef.current = handleRealtimeServerMessage;

  const sendJsonMessage = useCallback((message: RealtimeClientMessage): boolean => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      pendingOutgoingMessagesRef.current.push(message);
      return false;
    }
    socketRef.current.send(JSON.stringify(message));
    return true;
  }, []);
  const canSendJsonMessage = useCallback((): boolean => socketRef.current?.readyState === WebSocket.OPEN, []);
  sendJsonMessageRef.current = sendJsonMessage;

  useEffect(() => {
    if (!shouldConnect || !websocketUrl) {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      pendingDisconnectReasonRef.current = null;
      clearPendingDisconnectWarning();
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
        hasLoggedPersistentTransportUnavailableRef.current = false;
        pendingDisconnectReasonRef.current = null;
        clearPendingDisconnectWarning();
        setReadyState(RealtimeReadyState.OPEN);
        logger.info(`websocket transport opened to ${websocketUrl}`);
        const queuedMessages = pendingOutgoingMessagesRef.current.splice(0, pendingOutgoingMessagesRef.current.length);
        for (const queuedMessage of queuedMessages) {
          socket.send(JSON.stringify(queuedMessage));
        }
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        try {
          const parsedMessage = JSON.parse(event.data) as RealtimeServerMessage;
          if (parsedMessage.kind === "event") {
            const eventDetails =
              "snapshot" in parsedMessage.event && parsedMessage.event.snapshot
                ? ` node=${parsedMessage.event.snapshot.nodeId} status=${parsedMessage.event.snapshot.status}`
                : "";
            logger.info(`raw websocket event kind=${parsedMessage.event.kind}${eventDetails}`);
          } else {
            logger.info(`raw websocket control kind=${parsedMessage.kind}`);
          }
          handleRealtimeServerMessageRef.current(parsedMessage);
        } catch (error) {
          const exception = error instanceof Error ? error : new Error(String(error));
          logger.error(`failed to parse websocket message for ${websocketUrl}: ${exception.message}`);
        }
      });

      socket.addEventListener("error", () => {
        if (!hasOpenedConnectionRef.current) {
          if (!hasLoggedUnavailableTransportRef.current) {
            hasLoggedUnavailableTransportRef.current = true;
            logger.debug(`websocket transport is not available yet at ${websocketUrl}`);
          }
          return;
        }
        schedulePersistentDisconnectWarning("transport error while reconnecting");
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setReadyState(RealtimeReadyState.CLOSED);
        if (!hasOpenedConnectionRef.current && !hasLoggedUnavailableTransportRef.current) {
          hasLoggedUnavailableTransportRef.current = true;
          logger.debug(`websocket transport is not available yet at ${websocketUrl}`);
        }
        if (hasOpenedConnectionRef.current) {
          schedulePersistentDisconnectWarning(
            `closed code=${event.code} reason=${event.reason || "no-reason"} clean=${event.wasClean}`,
          );
        }
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
      clearPendingDisconnectWarning();
      if (socketRef.current) {
        setReadyState(RealtimeReadyState.CLOSING);
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [clearPendingDisconnectWarning, logger, schedulePersistentDisconnectWarning, shouldConnect, websocketUrl]);

  useEffect(() => {
    if (!shouldConnect || !devGatewayWebsocketUrl) {
      return;
    }
    const socket = new WebSocket(devGatewayWebsocketUrl);
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as { kind?: string; message?: string };
        if (parsed.kind === "devBuildCompleted") {
          void queryClient.invalidateQueries({ queryKey: workflowsQueryKey });
          void queryClient.invalidateQueries({
            predicate: (q) =>
              Array.isArray(q.queryKey) && q.queryKey[0] === "workflow" && typeof q.queryKey[1] === "string",
          });
          for (const query of queryClient.getQueryCache().findAll({ queryKey: ["workflow-dev-build-state"] })) {
            const key = query.queryKey;
            if (Array.isArray(key) && key[0] === "workflow-dev-build-state" && typeof key[1] === "string") {
              queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey(key[1]), {
                state: "idle",
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }
        if (parsed.kind === "devBuildFailed" && typeof parsed.message === "string") {
          logger.error(`consumer rebuild failed: ${parsed.message}`);
        }
      } catch {
        // ignore malformed gateway dev messages
      }
    });
    return () => {
      socket.close();
    };
  }, [devGatewayWebsocketUrl, logger, queryClient, shouldConnect]);

  useEffect(() => {
    return () => {
      clearPendingDisconnectWarning();
      for (const timeoutId of terminalEventTimeoutIdByNodeKeyRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      terminalEventTimeoutIdByNodeKeyRef.current.clear();
      activeStatusShownAtByNodeKeyRef.current.clear();
    };
  }, [clearPendingDisconnectWarning]);

  useEffect(() => {
    if (readyState === RealtimeReadyState.OPEN) {
      logger.info("websocket readyState changed to OPEN");
      return;
    }
    if (
      readyState === RealtimeReadyState.CLOSED &&
      hasOpenedConnectionRef.current &&
      disconnectWarningTimeoutRef.current === null &&
      pendingDisconnectReasonRef.current !== null
    ) {
      logger.warn("websocket readyState changed to CLOSED");
    }
  }, [logger, readyState]);

  useEffect(() => {
    if (readyState !== RealtimeReadyState.OPEN) return;
    for (const workflowId of desiredWorkflowCountsRef.current.keys()) {
      const sent = sendJsonMessage({ kind: "subscribe", roomId: workflowId } satisfies RealtimeClientMessage);
      logger.debug(`${sent ? "sent" : "queued"} subscribe for workflow ${workflowId}`);
    }
  }, [logger, readyState, sendJsonMessage]);

  const retainWorkflowSubscription = useCallback(
    (workflowId: string) => {
      const nextCount = (desiredWorkflowCountsRef.current.get(workflowId) ?? 0) + 1;
      desiredWorkflowCountsRef.current.set(workflowId, nextCount);
      setActiveWorkflowIds((current) => {
        const next = [...desiredWorkflowCountsRef.current.keys()];
        return current.length === next.length && current.every((value, index) => value === next[index])
          ? current
          : next;
      });
      if (nextCount === 1 && readyStateRef.current === RealtimeReadyState.OPEN && canSendJsonMessage()) {
        const sent = sendJsonMessageRef.current({
          kind: "subscribe",
          roomId: workflowId,
        } satisfies RealtimeClientMessage);
        logger.debug(`${sent ? "sent" : "queued"} retain subscription for workflow ${workflowId}`);
      }

      return () => {
        const currentCount = desiredWorkflowCountsRef.current.get(workflowId) ?? 0;
        if (currentCount <= 1) {
          desiredWorkflowCountsRef.current.delete(workflowId);
          setActiveWorkflowIds((current) => {
            const next = [...desiredWorkflowCountsRef.current.keys()];
            return current.length === next.length && current.every((value, index) => value === next[index])
              ? current
              : next;
          });
          if (readyStateRef.current === RealtimeReadyState.OPEN && canSendJsonMessage()) {
            const sent = sendJsonMessageRef.current({
              kind: "unsubscribe",
              roomId: workflowId,
            } satisfies RealtimeClientMessage);
            logger.debug(`${sent ? "sent" : "queued"} unsubscribe for workflow ${workflowId}`);
          }
          return;
        }
        desiredWorkflowCountsRef.current.set(workflowId, currentCount - 1);
        setActiveWorkflowIds((current) => {
          const next = [...desiredWorkflowCountsRef.current.keys()];
          return current.length === next.length && current.every((value, index) => value === next[index])
            ? current
            : next;
        });
      };
    },
    [canSendJsonMessage, logger],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({
      retainWorkflowSubscription,
      isConnected: readyState === RealtimeReadyState.OPEN,
      showDisconnectedBadge: readyState === RealtimeReadyState.CLOSED,
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

  return value;
}

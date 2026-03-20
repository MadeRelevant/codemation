import { ApiPaths } from "@codemation/frontend-src/presentation/http/ApiPaths";
import type { Logger } from "@codemation/frontend-src/application/logging/Logger";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";

import type { RealtimeContextValue } from "./RealtimeContext";
import { applyWorkflowEvent } from "./realtimeRunMutations";
import {
getRealtimeBridge,
minimumRealtimeActiveVisibilityMs,
persistentRealtimeDisconnectWarningDelayMs,
RealtimeReadyState,
type RealtimeClientMessage,
type RealtimeReadyValue,
type RealtimeServerMessage,
} from "./realtimeClientBridge";
import {
runQueryKey,
workflowDevBuildStateQueryKey,
workflowQueryKey,
workflowsQueryKey,
} from "./realtimeQueryKeys";
import type { PersistedRunState,WorkflowDevBuildState } from "./realtimeDomainTypes";

export function useWorkflowRealtimeInfrastructure(args: Readonly<{ logger: Logger; websocketPort?: string }>): RealtimeContextValue {
  const { logger, websocketPort } = args;
  const queryClient = useQueryClient();
  const desiredWorkflowCountsRef = useRef(new Map<string, number>());
  const pendingJsonMessagesRef = useRef<RealtimeServerMessage[]>([]);
  const activeStatusShownAtByNodeKeyRef = useRef(new Map<string, number>());
  const terminalEventTimeoutIdByNodeKeyRef = useRef(new Map<string, number>());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const disconnectWarningTimeoutRef = useRef<number | null>(null);
  const readyStateRef = useRef<RealtimeReadyValue>(RealtimeReadyState.UNINSTANTIATED);
  const hasOpenedConnectionRef = useRef(false);
  const hasLoggedUnavailableTransportRef = useRef(false);
  const pendingDisconnectReasonRef = useRef<string | null>(null);
  const [readyState, setReadyState] = useState<RealtimeReadyValue>(RealtimeReadyState.UNINSTANTIATED);
  const [messageQueueVersion, setMessageQueueVersion] = useState(0);
  const sendJsonMessageRef = useRef<(message: RealtimeClientMessage) => void>(() => {
    throw new Error("sendJsonMessage is not ready");
  });
  const [, setActiveWorkflowIds] = useState<ReadonlyArray<string>>([]);
  const websocketUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const port = websocketPort ?? window.location.port;
    const host = `${window.location.hostname}${port !== undefined && port !== "" ? `:${port}` : ""}`;
    return `${protocol}://${host}${ApiPaths.workflowWebsocket()}`;
  }, [websocketPort]);
  const shouldConnect = Boolean(websocketUrl);

  readyStateRef.current = readyState;
  const clearPendingDisconnectWarning = useCallback((): void => {
    if (disconnectWarningTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(disconnectWarningTimeoutRef.current);
    disconnectWarningTimeoutRef.current = null;
  }, []);
  const schedulePersistentDisconnectWarning = useCallback((reason: string): void => {
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
      logger.warn(
        `websocket transport is still unavailable after ${persistentRealtimeDisconnectWarningDelayMs}ms at ${websocketUrl}: ${pendingDisconnectReasonRef.current ?? reason}`,
      );
    }, persistentRealtimeDisconnectWarningDelayMs);
  }, [logger, websocketUrl]);
  const clearPendingTerminalEventDelay = useCallback((nodeKey: string): void => {
    const timeoutId = terminalEventTimeoutIdByNodeKeyRef.current.get(nodeKey);
    if (timeoutId === undefined) return;
    window.clearTimeout(timeoutId);
    terminalEventTimeoutIdByNodeKeyRef.current.delete(nodeKey);
  }, []);
  const clearRunRealtimeDelays = useCallback((runId: string): void => {
    const runPrefix = `${runId}:`;
    for (const nodeKey of terminalEventTimeoutIdByNodeKeyRef.current.keys()) {
      if (!nodeKey.startsWith(runPrefix)) continue;
      clearPendingTerminalEventDelay(nodeKey);
    }
    for (const nodeKey of activeStatusShownAtByNodeKeyRef.current.keys()) {
      if (!nodeKey.startsWith(runPrefix)) continue;
      activeStatusShownAtByNodeKeyRef.current.delete(nodeKey);
    }
  }, [clearPendingTerminalEventDelay]);
  const handleRealtimeServerMessage = useCallback(
    (message: RealtimeServerMessage) => {
      if (message.kind === "event") {
        const eventDetails = "snapshot" in message.event && message.event.snapshot ? `:${message.event.snapshot.nodeId}:${message.event.snapshot.status}` : "";
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
        queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey(message.workflowId), (existing) => ({
          state: "building",
          updatedAt: existing?.updatedAt ?? new Date().toISOString(),
          buildVersion: existing?.buildVersion,
          awaitingWorkflowRefreshAt: new Date().toISOString(),
        }));
        void queryClient.invalidateQueries({ queryKey: workflowQueryKey(message.workflowId) });
        void queryClient.invalidateQueries({ queryKey: workflowsQueryKey });
        void queryClient.refetchQueries({ queryKey: workflowQueryKey(message.workflowId), type: "active" });
        return;
      }

      if (message.kind === "devBuildStarted") {
        logger.info(`workflow rebuild started ${message.workflowId}`);
        queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey(message.workflowId), {
          state: "building",
          updatedAt: new Date().toISOString(),
          buildVersion: message.buildVersion,
          awaitingWorkflowRefreshAt: undefined,
        });
        return;
      }

      if (message.kind === "devBuildCompleted") {
        logger.info(`workflow rebuild completed ${message.workflowId} revision=${message.buildVersion}`);
        queryClient.setQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey(message.workflowId), (existing) => {
          if (existing?.awaitingWorkflowRefreshAt) {
            return {
              state: "building",
              updatedAt: new Date().toISOString(),
              buildVersion: message.buildVersion,
              awaitingWorkflowRefreshAt: existing.awaitingWorkflowRefreshAt,
            };
          }
          return {
            state: "idle",
            updatedAt: new Date().toISOString(),
            buildVersion: message.buildVersion,
          };
        });
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
  const sendJsonMessage = useCallback((message: RealtimeClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      throw new Error("sendJsonMessage is not ready");
    }
    socketRef.current.send(JSON.stringify(message));
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
        pendingDisconnectReasonRef.current = null;
        clearPendingDisconnectWarning();
        setReadyState(RealtimeReadyState.OPEN);
        logger.info(`websocket transport opened to ${websocketUrl}`);
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
          pendingJsonMessagesRef.current.push(parsedMessage);
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
          schedulePersistentDisconnectWarning(`closed code=${event.code} reason=${event.reason || "no-reason"} clean=${event.wasClean}`);
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
    if (pendingJsonMessagesRef.current.length === 0) {
      return;
    }
    const messages = pendingJsonMessagesRef.current.splice(0, pendingJsonMessagesRef.current.length);
    for (const message of messages) {
      handleRealtimeServerMessage(message);
    }
  }, [handleRealtimeServerMessage, messageQueueVersion]);

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
      sendJsonMessage({ kind: "subscribe", roomId: workflowId } satisfies RealtimeClientMessage);
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
        sendJsonMessageRef.current({ kind: "subscribe", roomId: workflowId } satisfies RealtimeClientMessage);
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
            sendJsonMessageRef.current({ kind: "unsubscribe", roomId: workflowId } satisfies RealtimeClientMessage);
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

  return value;
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext, useEffect, useRef } from "react";
import { telemetryRunTraceQueryKey } from "../../realtime/realtimeQueryKeys";
import type { PersistedRunState } from "../../realtime/realtimeDomainTypes";
import { RealtimeContext } from "../../components/realtime/RealtimeContext";
import { RealtimeReadyState } from "../../realtime/realtimeClientBridge";
import { useWorkflowCanvasApiClient } from "../../context/WorkflowCanvasApiClientContext";

export function useTelemetryRunTraceQuery(
  runId: string | null | undefined,
  options: Readonly<{
    disableFetch?: boolean;
    /**
     * @deprecated Was used for HTTP polling. Now a no-op — telemetry is streamed over
     * WebSocket and the query is only refetched on mount and after a WS reconnect.
     */
    pollWhileNonTerminalMs?: number;
    runStatus?: PersistedRunState["status"];
  }> = {},
) {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  const realtimeContext = useContext(RealtimeContext);
  const query = useQuery({
    queryKey: runId ? telemetryRunTraceQueryKey(runId) : ["telemetry-run-trace", "disabled"],
    queryFn: async ({ signal }) => await apiClient.fetchTelemetryRunTrace(runId!, { signal }),
    enabled: Boolean(runId) && !options.disableFetch,
    retry: false,
    staleTime: 30_000,
    // No polling: telemetry spans are streamed over WebSocket via TelemetrySpanWebsocketRelay.
    // The initial fetch on mount provides a snapshot; WS events splice in incremental updates.
    // Reconnect catchup is handled below via the readyState effect.
    refetchInterval: false,
  });

  // Subscribe to the per-run WS room while this hook is mounted.
  useEffect(() => {
    if (!runId || !realtimeContext) return;
    const unsubscribe = realtimeContext.retainRunSubscription(runId);
    return unsubscribe;
  }, [runId, realtimeContext]);

  // Refetch once when the WS reconnects after a previous disconnect, to catch up on any
  // spans missed during the disconnection window. Skip the initial UNINSTANTIATED → OPEN
  // transition (initial fetch already handles that).
  const previousReadyStateRef = useRef(realtimeContext?.readyState);
  useEffect(() => {
    const previousReadyState = previousReadyStateRef.current;
    const currentReadyState = realtimeContext?.readyState;
    previousReadyStateRef.current = currentReadyState;

    const wasDisconnected =
      previousReadyState === RealtimeReadyState.CLOSED || previousReadyState === RealtimeReadyState.CLOSING;
    const isNowOpen = currentReadyState === RealtimeReadyState.OPEN;

    if (wasDisconnected && isNowOpen && runId && !options.disableFetch) {
      void queryClient.invalidateQueries({ queryKey: telemetryRunTraceQueryKey(runId) });
    }
  }, [realtimeContext?.readyState, runId, options.disableFetch, queryClient]);

  const previousStatusRef = useRef<PersistedRunState["status"] | undefined>(options.runStatus);
  useEffect(() => {
    const previous = previousStatusRef.current;
    const current = options.runStatus;
    previousStatusRef.current = current;
    if (!runId) return;
    const wasNonTerminal = previous !== "completed" && previous !== "failed";
    const isTerminal = current === "completed" || current === "failed";
    if (wasNonTerminal && isTerminal) {
      void queryClient.invalidateQueries({ queryKey: telemetryRunTraceQueryKey(runId) });
    }
  }, [options.runStatus, runId, queryClient]);

  return query;
}

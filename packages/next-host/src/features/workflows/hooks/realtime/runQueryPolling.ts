import type { PersistedRunState } from "../../lib/realtime/realtimeDomainTypes";

/**
 * @deprecated No-op. Run state is now streamed over WebSocket via
 * `WorkflowRunEventWebsocketRelay` and spliced into the query cache by
 * `applyWorkflowEvent`. HTTP polling at 5 s while non-terminal was redundant
 * with the WS push and added a stale tail to every run; an HTTP refetch on
 * WS reconnect handles catch-up after a transient disconnect. Returns `false`
 * unconditionally so legacy callers passing `pollWhileNonTerminalMs` get the
 * new behaviour without an API churn.
 */
export function resolveRunPollingIntervalMs(_args: {
  runState?: PersistedRunState | undefined;
  pollWhileNonTerminalMs?: number | undefined;
}): false {
  return false;
}

/**
 * @deprecated No-op. Telemetry trace data is now streamed over WebSocket via
 * `TelemetrySpanWebsocketRelay` and spliced into the query cache by
 * `applyTelemetrySpanEvent`. HTTP polling was replaced by WS streaming to eliminate
 * redundant round-trips during short-lived runs (the previous implementation issued
 * ~4 HTTP trace GETs for a 16 ms run). The query still refetches on initial mount
 * and after WS reconnects for catch-up. This function is retained for callers that
 * have not been updated yet and always returns `false`.
 */
export function resolveTelemetryTraceRefetchIntervalMs(_args: {
  runStatus?: PersistedRunState["status"] | undefined;
  pollWhileNonTerminalMs?: number | undefined;
}): false {
  return false;
}

export function resolveFetchedRunState(args: {
  incoming: PersistedRunState;
  previous: PersistedRunState | undefined;
}): PersistedRunState {
  const { incoming, previous } = args;
  if (!previous) {
    return incoming;
  }
  if (previous.status === "completed" && incoming.status !== "completed") {
    return previous;
  }
  if (previous.status === "failed" && incoming.status === "pending") {
    return previous;
  }
  if (previous.status === "running" && incoming.status === "pending") {
    return previous;
  }
  return incoming;
}

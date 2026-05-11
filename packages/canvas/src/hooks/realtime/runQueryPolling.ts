import type { PersistedRunState } from "../../realtime/realtimeDomainTypes";

/**
 * Returns the polling interval for non-terminal runs, or `false` to disable polling.
 *
 * WS events (via `WorkflowRunEventWebsocketRelay`) are the primary path for run-state
 * updates, but the `InlineDrivingScheduler` defers node execution via `setTimeout(0)`,
 * so the HTTP trigger response carries only the initial queued snapshot. The poll here
 * acts as a catch-up safety net for cases where WS events are missed or delayed.
 * Returns `false` once the run is terminal so the poll self-cancels.
 */
export function resolveRunPollingIntervalMs(args: {
  runState?: PersistedRunState | undefined;
  pollWhileNonTerminalMs?: number | undefined;
}): number | false {
  const { runState, pollWhileNonTerminalMs } = args;
  if (!pollWhileNonTerminalMs) return false;
  const isTerminal = runState?.status === "completed" || runState?.status === "failed";
  return isTerminal ? false : pollWhileNonTerminalMs;
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

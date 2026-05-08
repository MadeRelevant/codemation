import type { PersistedRunState } from "../../lib/realtime/realtimeDomainTypes";

export function resolveRunPollingIntervalMs(args: {
  runState: PersistedRunState | undefined;
  pollWhileNonTerminalMs: number | undefined;
}): number | false {
  if (!args.runState || !args.pollWhileNonTerminalMs) {
    return false;
  }
  if (args.runState.status === "completed" || args.runState.status === "failed") {
    return false;
  }
  return args.pollWhileNonTerminalMs;
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

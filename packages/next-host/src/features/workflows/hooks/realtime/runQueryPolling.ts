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
 * Telemetry trace data is fetched independently from the run-state stream, so we keep its query
 * polling in lockstep with the run lifecycle: while the run is non-terminal (or unknown, e.g. the
 * run query has not yet hydrated) we poll at `pollWhileNonTerminalMs`, and we stop the moment the
 * run reaches a terminal state. Without this the right-side properties panel keeps showing the
 * first snapshot of spans (often "running" rows) even after the run has completed.
 */
export function resolveTelemetryTraceRefetchIntervalMs(args: {
  runStatus: PersistedRunState["status"] | undefined;
  pollWhileNonTerminalMs: number | undefined;
}): number | false {
  if (!args.pollWhileNonTerminalMs) return false;
  if (args.runStatus === "completed" || args.runStatus === "failed") return false;
  return args.pollWhileNonTerminalMs;
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

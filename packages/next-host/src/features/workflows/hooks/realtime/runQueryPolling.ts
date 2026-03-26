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

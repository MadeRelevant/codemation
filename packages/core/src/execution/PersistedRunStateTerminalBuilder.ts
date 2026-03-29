import type { EngineRunCounters, PersistedRunState, RunQueueEntry } from "../types";

/**
 * Merges common terminal-run fields onto a loaded {@link PersistedRunState} without repeating object literals.
 */
export class PersistedRunStateTerminalBuilder {
  mergeTerminal(args: {
    state: PersistedRunState;
    engineCounters: EngineRunCounters;
    status: "completed" | "failed";
    queue: RunQueueEntry[];
    outputsByNode: PersistedRunState["outputsByNode"];
    nodeSnapshotsByNodeId: NonNullable<PersistedRunState["nodeSnapshotsByNodeId"]>;
  }): PersistedRunState {
    return {
      ...args.state,
      engineCounters: args.engineCounters,
      status: args.status,
      pending: undefined,
      queue: args.queue,
      outputsByNode: args.outputsByNode,
      nodeSnapshotsByNodeId: args.nodeSnapshotsByNodeId,
    };
  }
}

import type { NodeId, NodeOutputs, ParentExecutionRef, PersistedRunState, RunId, RunStateStore, WorkflowId } from "../types";

export class InMemoryRunStateStore implements RunStateStore {
  private readonly runs = new Map<RunId, PersistedRunState>();

  async createRun(args: { runId: RunId; workflowId: WorkflowId; startedAt: string; parent?: ParentExecutionRef }): Promise<void> {
    this.runs.set(args.runId, {
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      status: "running",
      queue: [],
      outputsByNode: {} as Record<NodeId, NodeOutputs>,
    });
  }

  async load(runId: RunId): Promise<PersistedRunState | undefined> {
    return this.runs.get(runId);
  }

  async save(state: PersistedRunState): Promise<void> {
    this.runs.set(state.runId, state);
  }
}


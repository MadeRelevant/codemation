import type {
  NodeId,
  NodeOutputs,
  ParentExecutionRef,
  PersistedRunState,
  RunId,
  RunListingStore,
  RunStateStore,
  RunSummary,
  WorkflowId,
} from "../../types";
import { RunSummaryMapper } from "./RunSummaryMapper";

export class InMemoryRunStateStore implements RunStateStore, RunListingStore {
  private readonly runs = new Map<RunId, PersistedRunState>();

  async createRun(args: { runId: RunId; workflowId: WorkflowId; startedAt: string; parent?: ParentExecutionRef; executionOptions?: PersistedRunState["executionOptions"] }): Promise<void> {
    this.runs.set(args.runId, {
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      status: "running",
      queue: [],
      outputsByNode: {} as Record<NodeId, NodeOutputs>,
      nodeSnapshotsByNodeId: {},
    });
  }

  async load(runId: RunId): Promise<PersistedRunState | undefined> {
    return this.runs.get(runId);
  }

  async save(state: PersistedRunState): Promise<void> {
    this.runs.set(state.runId, state);
  }

  async listRuns(args?: Readonly<{ workflowId?: WorkflowId; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const limit = args?.limit ?? 50;
    const summaries = [...this.runs.values()]
      .filter((s) => (args?.workflowId ? s.workflowId === args.workflowId : true))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map((s) => RunSummaryMapper.fromPersistedState(s));
    return summaries;
  }
}


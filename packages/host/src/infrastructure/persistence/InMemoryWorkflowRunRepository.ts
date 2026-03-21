import {
RunFinishedAtFactory,
type NodeId,
type NodeOutputs,
type ParentExecutionRef,
type PersistedRunState,
type RunId,
type RunStateStore,
type RunSummary,
type WorkflowId,
} from "@codemation/core";
import { injectable } from "@codemation/core";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";

@injectable()
export class InMemoryWorkflowRunRepository implements WorkflowRunRepository, RunStateStore {
  private readonly runs = new Map<RunId, PersistedRunState>();

  async createRun(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: PersistedRunState["executionOptions"];
    control?: PersistedRunState["control"];
    workflowSnapshot?: PersistedRunState["workflowSnapshot"];
    mutableState?: PersistedRunState["mutableState"];
  }): Promise<void> {
    this.runs.set(args.runId, {
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      status: "running",
      queue: [],
      outputsByNode: {} as Record<NodeId, NodeOutputs>,
      nodeSnapshotsByNodeId: {},
    });
  }

  async load(runId: string): Promise<PersistedRunState | undefined> {
    return this.runs.get(decodeURIComponent(runId) as RunId);
  }

  async save(state: PersistedRunState): Promise<void> {
    this.runs.set(state.runId, state);
  }

  async listRuns(args: Readonly<{ workflowId?: string; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const limit = args?.limit ?? 50;
    const workflowId = args?.workflowId ? decodeURIComponent(args.workflowId) : undefined;
    const summaries = [...this.runs.values()]
      .filter((s) => (workflowId ? s.workflowId === workflowId : true))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map(
        (s): RunSummary => ({
          runId: s.runId,
          workflowId: s.workflowId,
          startedAt: s.startedAt,
          status: s.status,
          finishedAt: RunFinishedAtFactory.resolveIso(s),
          parent: s.parent,
          executionOptions: s.executionOptions,
        }),
      );
    return summaries;
  }
}

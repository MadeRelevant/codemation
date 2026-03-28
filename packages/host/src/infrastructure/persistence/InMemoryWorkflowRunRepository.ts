import {
  RunFinishedAtFactory,
  type NodeId,
  type NodeOutputs,
  type ParentExecutionRef,
  type PersistedRunState,
  type RunId,
  type RunPruneCandidate,
  type RunSummary,
  type WorkflowExecutionRepository,
  type WorkflowId,
} from "@codemation/core";
import { injectable } from "@codemation/core";
import { RunSummaryMapper } from "@codemation/core/bootstrap";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";

@injectable()
export class InMemoryWorkflowRunRepository implements WorkflowRunRepository, WorkflowExecutionRepository {
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
    policySnapshot?: PersistedRunState["policySnapshot"];
    engineCounters?: PersistedRunState["engineCounters"];
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
      policySnapshot: args.policySnapshot,
      engineCounters: args.engineCounters,
      status: "running",
      queue: [],
      outputsByNode: {} as Record<NodeId, NodeOutputs>,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
    });
  }

  async load(runId: string): Promise<PersistedRunState | undefined> {
    return this.runs.get(decodeURIComponent(runId) as RunId);
  }

  async save(state: PersistedRunState): Promise<void> {
    this.runs.set(state.runId, state);
  }

  async deleteRun(runId: RunId): Promise<void> {
    this.runs.delete(runId);
  }

  async listRuns(args: Readonly<{ workflowId?: string; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const limit = args?.limit ?? 50;
    const workflowId = args?.workflowId ? decodeURIComponent(args.workflowId) : undefined;
    const summaries = [...this.runs.values()]
      .filter((s) => (workflowId ? s.workflowId === workflowId : true))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map((s) => RunSummaryMapper.fromPersistedState(s));
    return summaries;
  }

  async listRunsOlderThan(
    args: Readonly<{ beforeIso: string; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>> {
    const limit = args.limit ?? 100;
    const out: RunPruneCandidate[] = [];
    for (const s of this.runs.values()) {
      if (s.status !== "completed" && s.status !== "failed") continue;
      const finishedAt = RunFinishedAtFactory.resolveIso(s);
      if (!finishedAt || finishedAt >= args.beforeIso) continue;
      out.push({
        runId: s.runId,
        workflowId: s.workflowId,
        startedAt: s.startedAt,
        finishedAt,
      });
    }
    out.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
    return out.slice(0, limit);
  }
}

import {
  RunFinishedAtFactory,
  type NodeId,
  type NodeOutputs,
  type ParentExecutionRef,
  type PersistedRunSchedulingState,
  type PersistedRunState,
  type RunId,
  type RunPruneCandidate,
  type RunSummary,
  type ExecutionInstanceDto,
  type SlotExecutionStateDto,
  type WorkflowRunDetailDto,
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
      revision: 0,
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

  async loadSchedulingState(runId: string): Promise<PersistedRunSchedulingState | undefined> {
    const state = await this.load(runId);
    if (!state) {
      return undefined;
    }
    return {
      pending: state.pending ? { ...state.pending } : undefined,
      queue: state.queue.map((entry) => ({ ...entry })),
    };
  }

  async save(state: PersistedRunState): Promise<void> {
    this.runs.set(state.runId, { ...state, revision: (state.revision ?? 0) + 1 });
  }

  async loadRunDetail(runId: string): Promise<WorkflowRunDetailDto | undefined> {
    const state = await this.load(runId);
    if (!state) {
      return undefined;
    }
    const slotStates: SlotExecutionStateDto[] = Object.entries(state.nodeSnapshotsByNodeId).map(
      ([slotNodeId, snapshot]) => ({
        slotNodeId,
        latestInstanceId: snapshot.activationId
          ? `${state.runId}:node:${slotNodeId}:${snapshot.activationId}`
          : undefined,
        latestTerminalInstanceId:
          snapshot.status === "completed" || snapshot.status === "failed"
            ? snapshot.activationId
              ? `${state.runId}:node:${slotNodeId}:${snapshot.activationId}`
              : undefined
            : undefined,
        latestRunningInstanceId:
          snapshot.status === "queued" || snapshot.status === "running"
            ? snapshot.activationId
              ? `${state.runId}:node:${slotNodeId}:${snapshot.activationId}`
              : undefined
            : undefined,
        status: snapshot.status,
        invocationCount: (state.connectionInvocations ?? []).filter((inv) => inv.connectionNodeId === slotNodeId)
          .length,
        runCount: 1,
      }),
    );
    const executionInstances: ExecutionInstanceDto[] = Object.entries(state.nodeSnapshotsByNodeId).map(
      ([slotNodeId, snapshot]) => ({
        instanceId: `${state.runId}:node:${slotNodeId}:${snapshot.activationId ?? "na"}`,
        slotNodeId,
        workflowNodeId: slotNodeId,
        kind: "workflowNodeActivation",
        runIndex: 1,
        batchId: state.pending?.batchId ?? "batch_1",
        activationId: snapshot.activationId,
        status: snapshot.status,
        queuedAt: snapshot.queuedAt,
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt,
        itemCount: Object.values(snapshot.inputsByPort ?? {}).reduce((count, items) => count + items.length, 0),
        inputJson: snapshot.inputsByPort as never,
        outputJson: snapshot.outputs as never,
        error: snapshot.error,
      }),
    );
    return {
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      status: state.status,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
      slotStates,
      executionInstances,
    };
  }

  async listBinaryStorageKeys(runId: RunId): Promise<ReadonlyArray<string>> {
    const state = await this.load(runId);
    if (!state) {
      return [];
    }
    const keys = new Set<string>();
    this.collectBinaryKeysFromRunState(state, keys);
    return [...keys].sort((left, right) => left.localeCompare(right));
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
    args: Readonly<{ nowIso: string; defaultRetentionSeconds: number; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>> {
    const limit = args.limit ?? 100;
    const out: RunPruneCandidate[] = [];
    for (const s of this.runs.values()) {
      if (s.status !== "completed" && s.status !== "failed") continue;
      const finishedAt = RunFinishedAtFactory.resolveIso(s);
      const retentionSeconds = s.policySnapshot?.retentionSeconds ?? args.defaultRetentionSeconds;
      const cutoffIso = new Date(new Date(args.nowIso).getTime() - retentionSeconds * 1000).toISOString();
      if (!finishedAt || finishedAt >= cutoffIso) continue;
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

  private collectBinaryKeysFromRunState(state: PersistedRunState, keys: Set<string>): void {
    for (const outputs of Object.values(state.outputsByNode)) {
      for (const items of Object.values(outputs)) {
        this.collectBinaryKeysFromItems(items, keys);
      }
    }
    for (const snapshot of Object.values(state.nodeSnapshotsByNodeId)) {
      for (const items of Object.values(snapshot.inputsByPort ?? {})) {
        this.collectBinaryKeysFromItems(items, keys);
      }
      for (const items of Object.values(snapshot.outputs ?? {})) {
        this.collectBinaryKeysFromItems(items, keys);
      }
    }
    for (const nodeState of Object.values(state.mutableState?.nodesById ?? {})) {
      for (const items of Object.values(nodeState.pinnedOutputsByPort ?? {})) {
        this.collectBinaryKeysFromItems(items, keys);
      }
      this.collectBinaryKeysFromItems(nodeState.lastDebugInput, keys);
    }
  }

  private collectBinaryKeysFromItems(
    items: PersistedRunState["outputsByNode"][string][string] | undefined,
    keys: Set<string>,
  ): void {
    for (const item of items ?? []) {
      for (const attachment of Object.values(item.binary ?? {})) {
        if (attachment.storageKey.length > 0) {
          keys.add(attachment.storageKey);
        }
      }
    }
  }
}

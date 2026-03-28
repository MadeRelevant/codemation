import type {
  NodeId,
  NodeOutputs,
  ParentExecutionRef,
  PersistedRunState,
  RunId,
  RunPruneCandidate,
  RunSummary,
  WorkflowExecutionRepository,
  WorkflowId,
} from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { PrismaClient } from "./generated/prisma-client/client.js";

/** JSON blob stored in stateJson: workflowSnapshot, mutableState, pending, queue, outputsByNode, nodeSnapshotsByNodeId, connectionInvocations, engineCounters */
interface StateJsonBlob {
  control?: PersistedRunState["control"];
  workflowSnapshot?: PersistedRunState["workflowSnapshot"];
  mutableState?: PersistedRunState["mutableState"];
  policySnapshot?: PersistedRunState["policySnapshot"];
  engineCounters?: PersistedRunState["engineCounters"];
  pending?: PersistedRunState["pending"];
  queue: PersistedRunState["queue"];
  outputsByNode: Record<NodeId, NodeOutputs>;
  nodeSnapshotsByNodeId: PersistedRunState["nodeSnapshotsByNodeId"];
  connectionInvocations?: PersistedRunState["connectionInvocations"];
}

@injectable()
export class PrismaWorkflowRunRepository implements WorkflowRunRepository, WorkflowExecutionRepository {
  constructor(@inject(PrismaClient) private readonly prisma: PrismaClient) {}

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
    const now = new Date().toISOString();
    const state: PersistedRunState = {
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
    };
    const stateJson = this.serializeStateBlob(state);
    await this.prisma.run.create({
      data: {
        runId: args.runId,
        workflowId: args.workflowId,
        startedAt: args.startedAt,
        status: "running",
        parentJson: args.parent ? JSON.stringify(args.parent) : null,
        executionOptionsJson: args.executionOptions ? JSON.stringify(args.executionOptions) : null,
        updatedAt: now,
        stateJson,
      },
    });
  }

  async load(runId: string): Promise<PersistedRunState | undefined> {
    const id = decodeURIComponent(runId) as RunId;
    const row = await this.prisma.run.findUnique({ where: { runId: id } });
    if (!row) return undefined;
    return this.rowToPersistedRunState(row);
  }

  async save(state: PersistedRunState): Promise<void> {
    const now = new Date().toISOString();
    const stateJson = this.serializeStateBlob(state);
    await this.prisma.run.upsert({
      where: { runId: state.runId },
      create: {
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        status: state.status,
        parentJson: state.parent ? JSON.stringify(state.parent) : null,
        executionOptionsJson: state.executionOptions ? JSON.stringify(state.executionOptions) : null,
        updatedAt: now,
        stateJson,
      },
      update: {
        status: state.status,
        parentJson: state.parent ? JSON.stringify(state.parent) : null,
        executionOptionsJson: state.executionOptions ? JSON.stringify(state.executionOptions) : null,
        updatedAt: now,
        stateJson,
      },
    });
  }

  async listRuns(args: Readonly<{ workflowId?: string; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const limit = args?.limit ?? 50;
    const workflowId = args?.workflowId ? decodeURIComponent(args.workflowId) : undefined;
    const rows = await this.prisma.run.findMany({
      where: workflowId ? { workflowId } : undefined,
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map((r) => this.rowToRunSummary(r));
  }

  async deleteRun(runId: RunId): Promise<void> {
    const id = decodeURIComponent(runId);
    await this.prisma.run.delete({ where: { runId: id } });
  }

  async listRunsOlderThan(
    args: Readonly<{ beforeIso: string; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>> {
    const limit = args.limit ?? 100;
    const rows = await this.prisma.run.findMany({
      where: {
        status: { in: ["completed", "failed"] },
        updatedAt: { lt: args.beforeIso },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map((r) => this.rowToPruneCandidate(r));
  }

  private serializeStateBlob(state: PersistedRunState): string {
    const blob: StateJsonBlob = {
      control: state.control,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
      policySnapshot: state.policySnapshot,
      engineCounters: state.engineCounters,
      pending: state.pending,
      queue: state.queue,
      outputsByNode: state.outputsByNode,
      nodeSnapshotsByNodeId: state.nodeSnapshotsByNodeId,
      connectionInvocations: state.connectionInvocations,
    };
    return JSON.stringify(blob);
  }

  private parseStateBlob(json: string): StateJsonBlob {
    const parsed = JSON.parse(json) as StateJsonBlob;
    return {
      control: parsed.control,
      workflowSnapshot: parsed.workflowSnapshot,
      mutableState: parsed.mutableState,
      policySnapshot: parsed.policySnapshot,
      engineCounters: parsed.engineCounters,
      pending: parsed.pending,
      queue: parsed.queue ?? [],
      outputsByNode: (parsed.outputsByNode ?? {}) as Record<NodeId, NodeOutputs>,
      nodeSnapshotsByNodeId: parsed.nodeSnapshotsByNodeId ?? {},
      connectionInvocations: parsed.connectionInvocations,
    };
  }

  private rowToPersistedRunState(row: {
    runId: string;
    workflowId: string;
    startedAt: string;
    status: string;
    parentJson: string | null;
    executionOptionsJson: string | null;
    stateJson: string;
  }): PersistedRunState {
    const blob = this.parseStateBlob(row.stateJson);
    return {
      runId: row.runId as RunId,
      workflowId: row.workflowId as WorkflowId,
      startedAt: row.startedAt,
      status: row.status as PersistedRunState["status"],
      parent: row.parentJson ? (JSON.parse(row.parentJson) as ParentExecutionRef) : undefined,
      executionOptions: row.executionOptionsJson
        ? (JSON.parse(row.executionOptionsJson) as PersistedRunState["executionOptions"])
        : undefined,
      control: blob.control,
      workflowSnapshot: blob.workflowSnapshot,
      mutableState: blob.mutableState,
      policySnapshot: blob.policySnapshot,
      engineCounters: blob.engineCounters,
      pending: blob.pending,
      queue: blob.queue,
      outputsByNode: blob.outputsByNode,
      nodeSnapshotsByNodeId: blob.nodeSnapshotsByNodeId,
      connectionInvocations: blob.connectionInvocations,
    };
  }

  private rowToPruneCandidate(row: {
    runId: string;
    workflowId: string;
    startedAt: string;
    updatedAt: string;
  }): RunPruneCandidate {
    return {
      runId: row.runId as RunId,
      workflowId: row.workflowId as WorkflowId,
      startedAt: row.startedAt,
      finishedAt: row.updatedAt,
    };
  }

  private rowToRunSummary(row: {
    runId: string;
    workflowId: string;
    startedAt: string;
    status: string;
    parentJson: string | null;
    executionOptionsJson: string | null;
    updatedAt: string;
  }): RunSummary {
    const status = row.status as RunSummary["status"];
    const finishedAt = status === "completed" || status === "failed" ? row.updatedAt : undefined;
    return {
      runId: row.runId as RunId,
      workflowId: row.workflowId as WorkflowId,
      startedAt: row.startedAt,
      status,
      finishedAt,
      parent: row.parentJson ? (JSON.parse(row.parentJson) as ParentExecutionRef) : undefined,
      executionOptions: row.executionOptionsJson
        ? (JSON.parse(row.executionOptionsJson) as RunSummary["executionOptions"])
        : undefined,
    };
  }
}

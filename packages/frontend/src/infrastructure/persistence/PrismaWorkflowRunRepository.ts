import type {
NodeId,
NodeOutputs,
ParentExecutionRef,
PersistedRunState,
RunId,
RunStateStore,
RunSummary,
WorkflowId,
} from "@codemation/core";
import { inject,injectable } from "@codemation/core";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { PrismaClient } from "./generated/prisma-client/client.js";

/** JSON blob stored in stateJson: workflowSnapshot, mutableState, pending, queue, outputsByNode, nodeSnapshotsByNodeId */
interface StateJsonBlob {
  control?: PersistedRunState["control"];
  workflowSnapshot?: PersistedRunState["workflowSnapshot"];
  mutableState?: PersistedRunState["mutableState"];
  pending?: PersistedRunState["pending"];
  queue: PersistedRunState["queue"];
  outputsByNode: Record<NodeId, NodeOutputs>;
  nodeSnapshotsByNodeId: PersistedRunState["nodeSnapshotsByNodeId"];
}

@injectable()
export class PrismaWorkflowRunRepository implements WorkflowRunRepository, RunStateStore {
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
      status: "running",
      queue: [],
      outputsByNode: {} as Record<NodeId, NodeOutputs>,
      nodeSnapshotsByNodeId: {},
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

  private serializeStateBlob(state: PersistedRunState): string {
    const blob: StateJsonBlob = {
      control: state.control,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
      pending: state.pending,
      queue: state.queue,
      outputsByNode: state.outputsByNode,
      nodeSnapshotsByNodeId: state.nodeSnapshotsByNodeId,
    };
    return JSON.stringify(blob);
  }

  private parseStateBlob(json: string): StateJsonBlob {
    const parsed = JSON.parse(json) as StateJsonBlob;
    return {
      control: parsed.control,
      workflowSnapshot: parsed.workflowSnapshot,
      mutableState: parsed.mutableState,
      pending: parsed.pending,
      queue: parsed.queue ?? [],
      outputsByNode: (parsed.outputsByNode ?? {}) as Record<NodeId, NodeOutputs>,
      nodeSnapshotsByNodeId: parsed.nodeSnapshotsByNodeId ?? {},
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
      pending: blob.pending,
      queue: blob.queue,
      outputsByNode: blob.outputsByNode,
      nodeSnapshotsByNodeId: blob.nodeSnapshotsByNodeId,
    };
  }

  private rowToRunSummary(row: {
    runId: string;
    workflowId: string;
    startedAt: string;
    status: string;
    parentJson: string | null;
    executionOptionsJson: string | null;
  }): RunSummary {
    return {
      runId: row.runId as RunId,
      workflowId: row.workflowId as WorkflowId,
      startedAt: row.startedAt,
      status: row.status as RunSummary["status"],
      parent: row.parentJson ? (JSON.parse(row.parentJson) as ParentExecutionRef) : undefined,
      executionOptions: row.executionOptionsJson
        ? (JSON.parse(row.executionOptionsJson) as RunSummary["executionOptions"])
        : undefined,
    };
  }
}

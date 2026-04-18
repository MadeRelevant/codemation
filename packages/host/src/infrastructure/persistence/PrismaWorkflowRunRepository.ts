import type {
  ConnectionInvocationRecord,
  ExecutionInstanceDto,
  NodeInputsByPort,
  NodeExecutionSnapshot,
  NodeId,
  NodeOutputs,
  ParentExecutionRef,
  PendingNodeExecution,
  PersistedRunSchedulingState,
  PersistedRunState,
  RunId,
  RunPruneCandidate,
  RunQueueEntry,
  RunSummary,
  SlotExecutionStateDto,
  WorkflowRunDetailDto,
  WorkflowExecutionRepository,
  WorkflowId,
} from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import type { Prisma } from "./generated/prisma-postgresql-client/client.js";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

type ExecutionInstanceRow = {
  instanceId: string;
  runId: string;
  workflowId: string;
  slotNodeId: string;
  workflowNodeId: string;
  kind: string;
  connectionKind: string | null;
  activationId: string | null;
  batchId: string;
  runIndex: number;
  parentInstanceId: string | null;
  status: string;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  itemCount: number;
  inputJson: string | null;
  outputJson: string | null;
  errorJson: string | null;
  inputItemIndicesJson: string | null;
  outputItemCount: number | null;
  successfulItemCount: number | null;
  failedItemCount: number | null;
  usedPinnedOutput: boolean | null;
};

type RunWorkItemRecord = {
  workItemId: string;
  runId: string;
  workflowId: string;
  status: string;
  targetNodeId: string;
  batchId: string;
  queueName: string | null;
  claimToken: string | null;
  availableAt: string;
  enqueuedAt: string;
  itemsIn: number;
  inputsByPortJson: string;
};

type RunSlotProjectionRow = {
  runId: string;
  workflowId: string;
  revision: number;
  updatedAt: string;
  slotStatesJson: string;
};

@injectable()
export class PrismaWorkflowRunRepository implements WorkflowRunRepository, WorkflowExecutionRepository {
  constructor(@inject(PrismaDatabaseClientToken) private readonly prisma: PrismaDatabaseClient) {}

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
    await this.prisma.run.create({
      data: {
        runId: args.runId,
        workflowId: args.workflowId,
        startedAt: args.startedAt,
        status: "running",
        parentJson: args.parent ? JSON.stringify(args.parent) : null,
        executionOptionsJson: args.executionOptions ? JSON.stringify(args.executionOptions) : null,
        updatedAt: now,
        revision: 0,
        outputsByNodeJson: JSON.stringify({}),
        controlJson: args.control ? JSON.stringify(args.control) : null,
        workflowSnapshotJson: args.workflowSnapshot ? JSON.stringify(args.workflowSnapshot) : null,
        policySnapshotJson: args.policySnapshot ? JSON.stringify(args.policySnapshot) : null,
        engineCountersJson: args.engineCounters ? JSON.stringify(args.engineCounters) : null,
        mutableStateJson: args.mutableState ? JSON.stringify(args.mutableState) : null,
      },
    });
  }

  async load(runId: string): Promise<PersistedRunState | undefined> {
    const id = decodeURIComponent(runId) as RunId;
    const row = await this.prisma.run.findUnique({ where: { runId: id } });
    if (!row) return undefined;

    const [schedulingState, instances] = await Promise.all([
      this.loadSchedulingState(id),
      this.prisma.executionInstance.findMany({
        where: { runId: id },
        orderBy: [{ slotNodeId: "asc" }, { runIndex: "asc" }],
      }),
    ]);

    const { nodeSnapshotsByNodeId, connectionInvocations } = this.instancesToDomain(
      row.runId as RunId,
      row.workflowId as WorkflowId,
      instances as ExecutionInstanceRow[],
    );

    const parent = this.parseJson<ParentExecutionRef>(row.parentJson);
    const persistedOutputsByNode = this.parseJson<Record<NodeId, NodeOutputs>>(row.outputsByNodeJson) ?? {};
    const merged: PersistedRunState = {
      runId: row.runId as RunId,
      workflowId: row.workflowId as WorkflowId,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt ?? undefined,
      revision: row.revision,
      parent,
      executionOptions: this.parseJson(row.executionOptionsJson),
      control: this.parseJson(row.controlJson),
      workflowSnapshot: this.parseJson(row.workflowSnapshotJson),
      mutableState: this.parseJson(row.mutableStateJson),
      policySnapshot: this.parseJson(row.policySnapshotJson),
      engineCounters: this.parseJson(row.engineCountersJson),
      status: row.status as PersistedRunState["status"],
      pending: schedulingState?.pending,
      queue: schedulingState?.queue ?? [],
      outputsByNode: this.mergePersistedOutputsByNode({
        persistedOutputsByNode,
        nodeSnapshotsByNodeId,
      }),
      nodeSnapshotsByNodeId,
      connectionInvocations: connectionInvocations.length > 0 ? connectionInvocations : undefined,
    };
    return this.applyParentToSnapshots(merged);
  }

  async loadSchedulingState(runId: RunId): Promise<PersistedRunSchedulingState | undefined> {
    const id = decodeURIComponent(runId) as RunId;
    const row = await this.prisma.run.findUnique({
      where: { runId: id },
      select: { runId: true },
    });
    if (!row) {
      return undefined;
    }
    const workItems = (await this.prisma.runWorkItem.findMany({
      where: { runId: id },
      orderBy: [{ status: "desc" }, { enqueuedAt: "asc" }, { workItemId: "asc" }],
    })) as RunWorkItemRecord[];
    const queue: RunQueueEntry[] = [];
    let pending: PendingNodeExecution | undefined;
    for (const workItem of workItems) {
      if (workItem.status === "claimed") {
        pending = this.toPendingNodeExecution(workItem);
        continue;
      }
      if (workItem.status === "queued") {
        queue.push(this.toQueueEntry(workItem));
      }
    }
    return { pending, queue };
  }

  async loadRunDetail(runId: string): Promise<WorkflowRunDetailDto | undefined> {
    const id = decodeURIComponent(runId) as RunId;
    const [row, projection, instances] = await Promise.all([
      this.prisma.run.findUnique({ where: { runId: id } }),
      this.prisma.runSlotProjection.findUnique({ where: { runId: id } }),
      this.prisma.executionInstance.findMany({
        where: { runId: id },
        orderBy: [{ updatedAt: "asc" }, { runIndex: "asc" }],
      }),
    ]);
    if (!row) {
      return undefined;
    }
    const slotStates = this.toSlotStateDtos(projection as RunSlotProjectionRow | null);
    const executionInstances = (instances as ExecutionInstanceRow[]).map((instance) =>
      this.toExecutionInstanceDto(instance),
    );
    return {
      runId: row.runId as RunId,
      workflowId: row.workflowId as WorkflowId,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt ?? undefined,
      status: row.status as WorkflowRunDetailDto["status"],
      workflowSnapshot: this.parseJson(row.workflowSnapshotJson),
      mutableState: this.parseJson(row.mutableStateJson) as WorkflowRunDetailDto["mutableState"],
      slotStates,
      executionInstances,
    };
  }

  async listBinaryStorageKeys(runId: RunId): Promise<ReadonlyArray<string>> {
    const id = decodeURIComponent(runId) as RunId;
    const row = await this.prisma.run.findUnique({
      where: { runId: id },
      select: { outputsByNodeJson: true, mutableStateJson: true },
    });
    if (!row) {
      return [];
    }
    const instances = (await this.prisma.executionInstance.findMany({
      where: { runId: id },
      select: { inputJson: true, outputJson: true },
    })) as Array<Pick<ExecutionInstanceRow, "inputJson" | "outputJson">>;
    const keys = new Set<string>();
    this.collectBinaryKeysFromJsonText(row.outputsByNodeJson, keys);
    this.collectBinaryKeysFromJsonText(row.mutableStateJson, keys);
    for (const instance of instances) {
      this.collectBinaryKeysFromJsonText(instance.inputJson, keys);
      this.collectBinaryKeysFromJsonText(instance.outputJson, keys);
    }
    return [...keys].sort((left, right) => left.localeCompare(right));
  }

  private applyParentToSnapshots(state: PersistedRunState): PersistedRunState {
    if (!state.parent) {
      return state;
    }
    const next: Record<NodeId, NodeExecutionSnapshot> = {};
    for (const [id, snap] of Object.entries(state.nodeSnapshotsByNodeId ?? {})) {
      next[id] = { ...snap, parent: state.parent };
    }
    return { ...state, nodeSnapshotsByNodeId: next };
  }

  async save(state: PersistedRunState): Promise<void> {
    let candidate = state;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.saveOnce(candidate);
        return;
      } catch (error) {
        if (!this.isConcurrentRunUpdateError(error) || attempt === 2) {
          throw error;
        }
        const latest = await this.load(candidate.runId);
        if (!latest) {
          throw error;
        }
        candidate = this.mergeConcurrentState(latest, candidate);
      }
    }
  }

  private async saveOnce(state: PersistedRunState): Promise<void> {
    const now = new Date().toISOString();
    const nextRevision = (state.revision ?? 0) + 1;
    const workItems = this.buildWorkItems(state, now);
    const instances = this.buildExecutionInstances(state);
    const projectionJson = this.buildProjectionSlotStatesJson(state);

    await this.prisma.$transaction(async (tx) => {
      await tx.runWorkItem.deleteMany({ where: { runId: state.runId } });
      if (workItems.length > 0) {
        await tx.runWorkItem.createMany({ data: workItems });
      }
      const existingInstances = await tx.executionInstance.findMany({
        where: { runId: state.runId },
        select: { instanceId: true, slotNodeId: true, runIndex: true },
      });
      const existingById = new Map(existingInstances.map((row) => [row.instanceId, row]));
      const maxRunIndexBySlot = new Map<string, number>();
      for (const row of existingInstances) {
        maxRunIndexBySlot.set(row.slotNodeId, Math.max(maxRunIndexBySlot.get(row.slotNodeId) ?? 0, row.runIndex));
      }
      for (const instance of instances) {
        const existing = existingById.get(instance.instanceId);
        const runIndex = existing?.runIndex ?? this.nextRunIndexForSlot(maxRunIndexBySlot, instance.slotNodeId);
        if (existing) {
          await tx.executionInstance.update({
            where: { instanceId: instance.instanceId },
            data: {
              workflowId: instance.workflowId,
              slotNodeId: instance.slotNodeId,
              workflowNodeId: instance.workflowNodeId,
              kind: instance.kind,
              connectionKind: instance.connectionKind,
              activationId: instance.activationId,
              batchId: instance.batchId,
              parentInstanceId: instance.parentInstanceId,
              parentRunId: instance.parentRunId,
              workerClaimToken: instance.workerClaimToken,
              status: instance.status,
              queuedAt: instance.queuedAt,
              startedAt: instance.startedAt,
              finishedAt: instance.finishedAt,
              updatedAt: instance.updatedAt,
              itemCount: instance.itemCount,
              inputJson: instance.inputJson,
              outputJson: instance.outputJson,
              errorJson: instance.errorJson,
              inputItemIndicesJson: instance.inputItemIndicesJson,
              outputItemCount: instance.outputItemCount,
              successfulItemCount: instance.successfulItemCount,
              failedItemCount: instance.failedItemCount,
              inputStorageKind: instance.inputStorageKind,
              outputStorageKind: instance.outputStorageKind,
              inputBytes: instance.inputBytes,
              outputBytes: instance.outputBytes,
              inputPreviewJson: instance.inputPreviewJson,
              outputPreviewJson: instance.outputPreviewJson,
              inputPayloadRef: instance.inputPayloadRef,
              outputPayloadRef: instance.outputPayloadRef,
              inputTruncated: instance.inputTruncated,
              outputTruncated: instance.outputTruncated,
              usedPinnedOutput: instance.usedPinnedOutput,
            },
          });
          continue;
        }
        await tx.executionInstance.create({
          data: {
            ...instance,
            runIndex,
          },
        });
      }
      await tx.runSlotProjection.upsert({
        where: { runId: state.runId },
        create: {
          runId: state.runId,
          workflowId: state.workflowId,
          revision: nextRevision,
          updatedAt: now,
          slotStatesJson: projectionJson,
        },
        update: {
          workflowId: state.workflowId,
          revision: nextRevision,
          updatedAt: now,
          slotStatesJson: projectionJson,
        },
      });
      const updated = await tx.run.updateMany({
        where: {
          runId: state.runId,
          revision: state.revision ?? 0,
        },
        data: {
          workflowId: state.workflowId,
          startedAt: state.startedAt,
          status: state.status,
          finishedAt: state.finishedAt ?? null,
          updatedAt: now,
          revision: nextRevision,
          parentJson: state.parent ? JSON.stringify(state.parent) : null,
          executionOptionsJson: state.executionOptions ? JSON.stringify(state.executionOptions) : null,
          controlJson: state.control ? JSON.stringify(state.control) : null,
          workflowSnapshotJson: state.workflowSnapshot ? JSON.stringify(state.workflowSnapshot) : null,
          policySnapshotJson: state.policySnapshot ? JSON.stringify(state.policySnapshot) : null,
          engineCountersJson: state.engineCounters ? JSON.stringify(state.engineCounters) : null,
          mutableStateJson: state.mutableState ? JSON.stringify(state.mutableState) : null,
          outputsByNodeJson: JSON.stringify(this.buildPersistedOutputsByNode(state)),
        },
      });
      if (updated.count !== 1) {
        throw new Error(`Concurrent run update detected for run ${state.runId}.`);
      }
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
    args: Readonly<{ nowIso: string; defaultRetentionSeconds: number; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>> {
    const limit = args.limit ?? 100;
    const rows = await this.prisma.run.findMany({
      where: {
        status: { in: ["completed", "failed"] },
      },
      select: {
        runId: true,
        workflowId: true,
        startedAt: true,
        finishedAt: true,
        updatedAt: true,
        policySnapshotJson: true,
      },
      orderBy: { updatedAt: "asc" },
      take: limit * 4,
    });
    return rows
      .filter((row) => {
        const finishedAt = row.finishedAt ?? row.updatedAt;
        const policySnapshot = this.parseJson<PersistedRunState["policySnapshot"]>(row.policySnapshotJson);
        const retentionSeconds = policySnapshot?.retentionSeconds ?? args.defaultRetentionSeconds;
        const cutoffIso = new Date(new Date(args.nowIso).getTime() - retentionSeconds * 1000).toISOString();
        return finishedAt < cutoffIso;
      })
      .slice(0, limit)
      .map((row) => this.rowToPruneCandidate(row));
  }

  private instancesToDomain(
    runId: RunId,
    workflowId: WorkflowId,
    instances: ExecutionInstanceRow[],
  ): {
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
  } {
    const nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot> = {};
    const connectionInvocations: ConnectionInvocationRecord[] = [];
    const workflowRows = instances.filter((i) => i.kind === "workflowNodeActivation");
    const byNode = new Map<NodeId, ExecutionInstanceRow>();
    for (const row of workflowRows) {
      const prev = byNode.get(row.slotNodeId);
      if (!prev || row.updatedAt > prev.updatedAt) {
        byNode.set(row.slotNodeId, row);
      }
    }
    for (const [nodeId, row] of byNode.entries()) {
      nodeSnapshotsByNodeId[nodeId] = this.rowToNodeSnapshot(runId, workflowId, nodeId, row);
    }
    const connRows = instances.filter((i) => i.kind === "connectionInvocation").sort((a, b) => a.runIndex - b.runIndex);
    for (const row of connRows) {
      connectionInvocations.push(this.rowToConnectionInvocation(runId, workflowId, row));
    }
    return { nodeSnapshotsByNodeId, connectionInvocations };
  }

  private rowToNodeSnapshot(
    runId: RunId,
    workflowId: WorkflowId,
    nodeId: NodeId,
    row: ExecutionInstanceRow,
  ): NodeExecutionSnapshot {
    const inputsByPort = row.inputJson
      ? (JSON.parse(row.inputJson) as NodeExecutionSnapshot["inputsByPort"])
      : undefined;
    const outputs = row.outputJson ? (JSON.parse(row.outputJson) as NodeOutputs) : undefined;
    const error = row.errorJson
      ? (JSON.parse(row.errorJson) as NonNullable<NodeExecutionSnapshot["error"]>)
      : undefined;
    return {
      runId,
      workflowId,
      nodeId,
      activationId: row.activationId ?? undefined,
      status: row.status as NodeExecutionSnapshot["status"],
      usedPinnedOutput: row.usedPinnedOutput ?? undefined,
      queuedAt: row.queuedAt ?? undefined,
      startedAt: row.startedAt ?? undefined,
      finishedAt: row.finishedAt ?? undefined,
      updatedAt: row.updatedAt,
      inputsByPort,
      outputs,
      error,
    };
  }

  private rowToConnectionInvocation(
    runId: RunId,
    workflowId: WorkflowId,
    row: ExecutionInstanceRow,
  ): ConnectionInvocationRecord {
    const err = row.errorJson
      ? (JSON.parse(row.errorJson) as NonNullable<ConnectionInvocationRecord["error"]>)
      : undefined;
    return {
      invocationId: row.instanceId,
      runId,
      workflowId,
      connectionNodeId: row.slotNodeId,
      parentAgentNodeId: row.workflowNodeId,
      parentAgentActivationId: row.activationId ?? `synthetic_${row.workflowNodeId}`,
      status: row.status as ConnectionInvocationRecord["status"],
      managedInput: row.inputJson ? JSON.parse(row.inputJson) : undefined,
      managedOutput: row.outputJson ? JSON.parse(row.outputJson) : undefined,
      error: err,
      queuedAt: row.queuedAt ?? undefined,
      startedAt: row.startedAt ?? undefined,
      finishedAt: row.finishedAt ?? undefined,
      updatedAt: row.updatedAt,
    };
  }

  private toExecutionInstanceDto(row: ExecutionInstanceRow): ExecutionInstanceDto {
    return {
      instanceId: row.instanceId,
      slotNodeId: row.slotNodeId as NodeId,
      workflowNodeId: row.workflowNodeId as NodeId,
      parentInstanceId: row.parentInstanceId ?? undefined,
      kind: row.kind as ExecutionInstanceDto["kind"],
      connectionKind: row.connectionKind as ExecutionInstanceDto["connectionKind"],
      runIndex: row.runIndex,
      batchId: row.batchId,
      activationId: row.activationId ?? undefined,
      status: row.status as ExecutionInstanceDto["status"],
      queuedAt: row.queuedAt ?? undefined,
      startedAt: row.startedAt ?? undefined,
      finishedAt: row.finishedAt ?? undefined,
      itemCount: row.itemCount,
      inputJson: row.inputJson ? (JSON.parse(row.inputJson) as ExecutionInstanceDto["inputJson"]) : undefined,
      outputJson: row.outputJson ? (JSON.parse(row.outputJson) as ExecutionInstanceDto["outputJson"]) : undefined,
      error: row.errorJson ? (JSON.parse(row.errorJson) as ExecutionInstanceDto["error"]) : undefined,
    };
  }

  private buildWorkItems(state: PersistedRunState, nowIso: string): Prisma.RunWorkItemCreateManyInput[] {
    const rows: Prisma.RunWorkItemCreateManyInput[] = [];
    for (const [index, entry] of (state.queue ?? []).entries()) {
      const inputsByPort = this.inputsByPortFromQueueEntry(entry);
      rows.push({
        workItemId: `${state.runId}:queued:${index}:${entry.nodeId}:${entry.batchId ?? "batch_1"}`,
        runId: state.runId,
        workflowId: state.workflowId,
        status: "queued",
        targetNodeId: entry.nodeId,
        batchId: entry.batchId ?? "batch_1",
        availableAt: nowIso,
        enqueuedAt: nowIso,
        itemsIn: this.countItemsByPort(inputsByPort),
        inputsByPortJson: JSON.stringify(inputsByPort),
      });
    }
    if (state.pending) {
      rows.push({
        workItemId: state.pending.activationId,
        runId: state.runId,
        workflowId: state.workflowId,
        status: "claimed",
        targetNodeId: state.pending.nodeId,
        batchId: state.pending.batchId ?? "batch_1",
        queueName: state.pending.queue,
        claimToken: state.pending.activationId,
        claimedAt: nowIso,
        availableAt: state.pending.enqueuedAt,
        enqueuedAt: state.pending.enqueuedAt,
        itemsIn: state.pending.itemsIn,
        inputsByPortJson: JSON.stringify(state.pending.inputsByPort),
      });
    }
    return rows;
  }

  private buildExecutionInstances(state: PersistedRunState): Prisma.ExecutionInstanceCreateManyInput[] {
    const rows: Prisma.ExecutionInstanceCreateManyInput[] = [];
    for (const [nodeId, snap] of Object.entries(state.nodeSnapshotsByNodeId ?? {})) {
      const instanceId = `${state.runId}:node:${nodeId}:${snap.activationId ?? "na"}`;
      const itemCount = this.countItemsByPort(snap.inputsByPort) || this.countItemsInOutputs(snap.outputs);
      rows.push({
        instanceId,
        runId: state.runId,
        workflowId: state.workflowId,
        slotNodeId: nodeId,
        workflowNodeId: nodeId,
        kind: "workflowNodeActivation",
        connectionKind: null,
        activationId: snap.activationId ?? null,
        batchId: state.pending?.batchId ?? "batch_1",
        runIndex: 1,
        status: snap.status,
        queuedAt: snap.queuedAt ?? null,
        startedAt: snap.startedAt ?? null,
        finishedAt: snap.finishedAt ?? null,
        updatedAt: snap.updatedAt,
        itemCount,
        inputJson: snap.inputsByPort ? JSON.stringify(snap.inputsByPort) : null,
        outputJson: snap.outputs ? JSON.stringify(snap.outputs) : null,
        errorJson: snap.error ? JSON.stringify(snap.error) : null,
        inputItemIndicesJson: null,
        outputItemCount: snap.outputs ? this.countItemsInOutputs(snap.outputs) : null,
        successfulItemCount: null,
        failedItemCount: snap.status === "failed" ? itemCount : null,
        inputStorageKind: "inline",
        outputStorageKind: "inline",
        usedPinnedOutput: snap.usedPinnedOutput ?? null,
      });
    }
    let cIdx = 0;
    for (const inv of state.connectionInvocations ?? []) {
      if (inv.runId !== state.runId) {
        // Defense-in-depth: `invocationId` is a global primary key in `ExecutionInstance`.
        // A record whose `runId` differs from the current run belongs to another run and
        // would collide on insert. `RunStartService.createRunCurrentState` already prevents
        // carry-over; we skip here so any other accidental carry-over path self-heals
        // instead of crashing the save.
        continue;
      }
      rows.push({
        instanceId: inv.invocationId,
        runId: state.runId,
        workflowId: state.workflowId,
        slotNodeId: inv.connectionNodeId,
        workflowNodeId: inv.parentAgentNodeId,
        kind: "connectionInvocation",
        connectionKind: "languageModel",
        activationId: inv.parentAgentActivationId,
        batchId: state.pending?.batchId ?? "batch_1",
        runIndex: cIdx,
        status: inv.status,
        queuedAt: inv.queuedAt ?? null,
        startedAt: inv.startedAt ?? null,
        finishedAt: inv.finishedAt ?? null,
        updatedAt: inv.updatedAt,
        itemCount: 0,
        inputJson: inv.managedInput !== undefined ? JSON.stringify(inv.managedInput) : null,
        outputJson: inv.managedOutput !== undefined ? JSON.stringify(inv.managedOutput) : null,
        errorJson: inv.error ? JSON.stringify(inv.error) : null,
        inputItemIndicesJson: null,
        outputItemCount: null,
        successfulItemCount: null,
        failedItemCount: null,
        inputStorageKind: "inline",
        outputStorageKind: "inline",
      });
      cIdx += 1;
    }
    return rows;
  }

  private rowToPruneCandidate(row: {
    runId: string;
    workflowId: string;
    startedAt: string;
    updatedAt: string;
    finishedAt: string | null;
  }): RunPruneCandidate {
    const finishedAt = row.finishedAt ?? row.updatedAt;
    return {
      runId: row.runId as RunId,
      workflowId: row.workflowId as WorkflowId,
      startedAt: row.startedAt,
      finishedAt,
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
    finishedAt: string | null;
  }): RunSummary {
    const status = row.status as RunSummary["status"];
    const finishedAt = status === "completed" || status === "failed" ? (row.finishedAt ?? row.updatedAt) : undefined;
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

  private parseJson<T>(value: string | null): T | undefined {
    if (!value) {
      return undefined;
    }
    return JSON.parse(value) as T;
  }

  private toPendingNodeExecution(row: RunWorkItemRecord): PendingNodeExecution {
    return {
      runId: row.runId as RunId,
      activationId: (row.claimToken ?? row.workItemId) as PendingNodeExecution["activationId"],
      workflowId: row.workflowId as WorkflowId,
      nodeId: row.targetNodeId as NodeId,
      itemsIn: row.itemsIn,
      inputsByPort: JSON.parse(row.inputsByPortJson) as NodeInputsByPort,
      receiptId: row.claimToken ?? row.workItemId,
      queue: row.queueName ?? undefined,
      batchId: row.batchId,
      enqueuedAt: row.enqueuedAt,
    };
  }

  private toQueueEntry(row: RunWorkItemRecord): RunQueueEntry {
    const inputsByPort = JSON.parse(row.inputsByPortJson) as NodeInputsByPort;
    const portEntries = Object.entries(inputsByPort);
    if (portEntries.length <= 1) {
      const [portKey, items] = portEntries[0] ?? ["in", []];
      return {
        nodeId: row.targetNodeId as NodeId,
        input: items,
        toInput: portKey === "in" ? undefined : portKey,
        batchId: row.batchId,
      };
    }
    return {
      nodeId: row.targetNodeId as NodeId,
      input: [],
      batchId: row.batchId,
      collect: {
        expectedInputs: portEntries.map(([portKey]) => portKey),
        received: inputsByPort,
      },
    };
  }

  private inputsByPortFromQueueEntry(entry: RunQueueEntry): NodeInputsByPort {
    if (entry.collect) {
      return entry.collect.received;
    }
    return {
      [(entry.toInput ?? "in") as string]: entry.input,
    };
  }

  private countItemsByPort(inputsByPort: NodeInputsByPort | undefined): number {
    let count = 0;
    for (const items of Object.values(inputsByPort ?? {})) {
      count += items.length;
    }
    return count;
  }

  private countItemsInOutputs(outputs: NodeOutputs | undefined): number {
    let count = 0;
    for (const items of Object.values(outputs ?? {})) {
      count += items?.length ?? 0;
    }
    return count;
  }

  private buildProjectionSlotStatesJson(state: PersistedRunState): string {
    const slotStatesByNodeId: Record<
      string,
      {
        latestInstanceId?: string;
        latestTerminalInstanceId?: string;
        latestRunningInstanceId?: string;
        latestStatus?: string;
        invocationCount: number;
        runCount: number;
      }
    > = {};
    for (const [nodeId, snapshot] of Object.entries(state.nodeSnapshotsByNodeId ?? {})) {
      const latestInstanceId = `${state.runId}:node:${nodeId}:${snapshot.activationId ?? "na"}`;
      slotStatesByNodeId[nodeId] = {
        latestInstanceId,
        latestTerminalInstanceId:
          snapshot.status === "completed" || snapshot.status === "failed" ? latestInstanceId : undefined,
        latestRunningInstanceId:
          snapshot.status === "queued" || snapshot.status === "running" ? latestInstanceId : undefined,
        latestStatus: snapshot.status,
        invocationCount: 0,
        runCount: snapshot.status === "completed" || snapshot.status === "failed" ? 1 : 0,
      };
    }
    for (const invocation of state.connectionInvocations ?? []) {
      const existing = slotStatesByNodeId[invocation.connectionNodeId] ?? {
        invocationCount: 0,
        runCount: 0,
      };
      existing.invocationCount += 1;
      slotStatesByNodeId[invocation.connectionNodeId] = existing;
    }
    return JSON.stringify({ slotStatesByNodeId });
  }

  private toSlotStateDtos(projection: RunSlotProjectionRow | null): ReadonlyArray<SlotExecutionStateDto> {
    const state = this.parseJson<{ slotStatesByNodeId?: Record<string, SlotExecutionStateDto> }>(
      projection?.slotStatesJson ?? null,
    );
    return Object.entries(state?.slotStatesByNodeId ?? {}).map(([slotNodeId, slotState]) => ({
      slotNodeId: slotNodeId as NodeId,
      latestInstanceId: slotState.latestInstanceId,
      latestTerminalInstanceId: slotState.latestTerminalInstanceId,
      latestRunningInstanceId: slotState.latestRunningInstanceId,
      status:
        slotState.status ??
        (slotState as SlotExecutionStateDto & { latestStatus?: SlotExecutionStateDto["status"] }).latestStatus,
      invocationCount: slotState.invocationCount,
      runCount: slotState.runCount,
    }));
  }

  private buildPersistedOutputsByNode(state: PersistedRunState): Record<NodeId, NodeOutputs> {
    const persistedOutputsByNode: Record<NodeId, NodeOutputs> = {};
    for (const [nodeId, outputs] of Object.entries(state.outputsByNode ?? {})) {
      if (state.nodeSnapshotsByNodeId[nodeId]) {
        continue;
      }
      persistedOutputsByNode[nodeId as NodeId] = outputs;
    }
    return persistedOutputsByNode;
  }

  private mergePersistedOutputsByNode(
    args: Readonly<{
      persistedOutputsByNode: Record<NodeId, NodeOutputs>;
      nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
    }>,
  ): Record<NodeId, NodeOutputs> {
    const mergedOutputsByNode: Record<NodeId, NodeOutputs> = {
      ...args.persistedOutputsByNode,
    };
    for (const [nodeId, snapshot] of Object.entries(args.nodeSnapshotsByNodeId)) {
      if (snapshot.outputs) {
        mergedOutputsByNode[nodeId as NodeId] = snapshot.outputs;
      }
    }
    return mergedOutputsByNode;
  }

  private nextRunIndexForSlot(maxRunIndexBySlot: Map<string, number>, slotNodeId: string): number {
    const next = (maxRunIndexBySlot.get(slotNodeId) ?? 0) + 1;
    maxRunIndexBySlot.set(slotNodeId, next);
    return next;
  }

  private mergeConcurrentState(latest: PersistedRunState, desired: PersistedRunState): PersistedRunState {
    return {
      ...latest,
      ...desired,
      revision: latest.revision,
      parent: desired.parent ?? latest.parent,
      executionOptions: desired.executionOptions ?? latest.executionOptions,
      control: desired.control ?? latest.control,
      workflowSnapshot: desired.workflowSnapshot ?? latest.workflowSnapshot,
      mutableState: desired.mutableState ?? latest.mutableState,
      policySnapshot: desired.policySnapshot ?? latest.policySnapshot,
      engineCounters: desired.engineCounters ?? latest.engineCounters,
      pending: desired.pending,
      queue: desired.queue,
      outputsByNode: {
        ...(latest.outputsByNode ?? {}),
        ...(desired.outputsByNode ?? {}),
      },
      nodeSnapshotsByNodeId: this.mergeNodeSnapshots(latest.nodeSnapshotsByNodeId, desired.nodeSnapshotsByNodeId),
      connectionInvocations: this.mergeConnectionInvocations(
        latest.connectionInvocations,
        desired.connectionInvocations,
      ),
    };
  }

  private mergeNodeSnapshots(
    latest: PersistedRunState["nodeSnapshotsByNodeId"],
    desired: PersistedRunState["nodeSnapshotsByNodeId"],
  ): PersistedRunState["nodeSnapshotsByNodeId"] {
    const merged: PersistedRunState["nodeSnapshotsByNodeId"] = {
      ...(latest ?? {}),
    };
    for (const [nodeId, snapshot] of Object.entries(desired ?? {})) {
      const current = merged[nodeId as NodeId];
      if (!current || (snapshot.updatedAt ?? "") >= (current.updatedAt ?? "")) {
        merged[nodeId as NodeId] = snapshot;
      }
    }
    return merged;
  }

  private mergeConnectionInvocations(
    latest: PersistedRunState["connectionInvocations"],
    desired: PersistedRunState["connectionInvocations"],
  ): PersistedRunState["connectionInvocations"] {
    const byId = new Map<string, NonNullable<PersistedRunState["connectionInvocations"]>[number]>();
    for (const record of latest ?? []) {
      byId.set(record.invocationId, record);
    }
    for (const record of desired ?? []) {
      const current = byId.get(record.invocationId);
      if (!current || record.updatedAt >= current.updatedAt) {
        byId.set(record.invocationId, record);
      }
    }
    return [...byId.values()].sort(
      (left, right) =>
        left.updatedAt.localeCompare(right.updatedAt) || left.invocationId.localeCompare(right.invocationId),
    );
  }

  private isConcurrentRunUpdateError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("Concurrent run update detected");
  }

  private collectBinaryKeysFromJsonText(value: string | null, keys: Set<string>): void {
    if (!value) {
      return;
    }
    this.collectBinaryKeysFromValue(JSON.parse(value) as unknown, keys);
  }

  private collectBinaryKeysFromValue(value: unknown, keys: Set<string>): void {
    if (Array.isArray(value)) {
      for (const entry of value) {
        this.collectBinaryKeysFromValue(entry, keys);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.id === "string" &&
      typeof record.storageKey === "string" &&
      typeof record.mimeType === "string" &&
      typeof record.size === "number"
    ) {
      if (record.storageKey.length > 0) {
        keys.add(record.storageKey);
      }
      return;
    }
    for (const child of Object.values(record)) {
      this.collectBinaryKeysFromValue(child, keys);
    }
  }
}

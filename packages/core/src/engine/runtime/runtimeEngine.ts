import type { Container } from "../../di";
import type {
  EngineDeps,
  EngineHost,
  InputPortKey,
  Items,
  NodeActivationContinuation,
  NodeActivationId,
  NodeActivationRequest,
  NodeActivationScheduler,
  NodeExecutionSnapshot,
  NodeActivationStats,
  NodeId,
  NodeExecutionScheduler,
  NodeInputsByPort,
  NodeOffloadPolicy,
  NodeOutputs,
  OutputPortKey,
  ParentExecutionRef,
  PendingNodeExecution,
  RunQueueEntry,
  RunId,
  RunDataFactory,
  RunResult,
  RunStateStore,
  ExecutionContextFactory,
  TriggerNode,
  WorkflowDefinition,
  WorkflowId,
} from "../../types";
import type { RunEventBus } from "../../events";

import { DefaultExecutionContextFactory } from "../context/defaultExecutionContextFactory";
import { RunQueuePlanner } from "../planning/runQueuePlanner";
import { WorkflowTopology } from "../planning/workflowTopology";
import { DefaultDrivingScheduler } from "../scheduling/defaultDrivingScheduler";
import { ConfigDrivenOffloadPolicy } from "../scheduling/configDrivenOffloadPolicy";
import { LocalOnlyScheduler } from "../scheduling/localOnlyScheduler";
import { InMemoryRunDataFactory } from "../storage/inMemoryRunDataFactory";
import { InMemoryRunStateStore } from "../storage/inMemoryRunStateStore";

class OutputStats {
  static toItemsOutByPort(outputs: NodeOutputs): Record<OutputPortKey, number> {
    const out: Record<OutputPortKey, number> = {};
    for (const [port, produced] of Object.entries(outputs)) out[port] = produced?.length ?? 0;
    return out;
  }
}

class InputPortMap {
  static empty(): NodeInputsByPort {
    return {};
  }

  static fromRequest(request: NodeActivationRequest): NodeInputsByPort {
    if (request.kind === "multi") return request.inputsByPort;
    return { in: request.input };
  }
}

class NodeSnapshotFactory {
  static queued(args: {
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    queuedAt: string;
    inputsByPort: NodeInputsByPort;
  }): NodeExecutionSnapshot {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "queued",
      queuedAt: args.queuedAt,
      updatedAt: args.queuedAt,
      inputsByPort: args.inputsByPort,
    };
  }

  static running(args: {
    previous?: NodeExecutionSnapshot;
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    startedAt: string;
    inputsByPort: NodeInputsByPort;
  }): NodeExecutionSnapshot {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "running",
      queuedAt: args.previous?.queuedAt,
      startedAt: args.startedAt,
      updatedAt: args.startedAt,
      inputsByPort: args.inputsByPort,
      outputs: args.previous?.outputs,
      error: undefined,
    };
  }

  static completed(args: {
    previous?: NodeExecutionSnapshot;
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    finishedAt: string;
    inputsByPort: NodeInputsByPort;
    outputs: NodeOutputs;
  }): NodeExecutionSnapshot {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "completed",
      queuedAt: args.previous?.queuedAt,
      startedAt: args.previous?.startedAt,
      finishedAt: args.finishedAt,
      updatedAt: args.finishedAt,
      inputsByPort: args.inputsByPort,
      outputs: args.outputs,
      error: undefined,
    };
  }

  static failed(args: {
    previous?: NodeExecutionSnapshot;
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    finishedAt: string;
    inputsByPort: NodeInputsByPort;
    error: Error;
  }): NodeExecutionSnapshot {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "failed",
      queuedAt: args.previous?.queuedAt,
      startedAt: args.previous?.startedAt,
      finishedAt: args.finishedAt,
      updatedAt: args.finishedAt,
      inputsByPort: args.inputsByPort,
      outputs: undefined,
      error: { message: args.error.message },
    };
  }
}

export class Engine implements NodeActivationContinuation {
  private readonly container: Container;
  private readonly host: EngineHost;
  private readonly makeRunId: () => RunId;
  private readonly makeActivationId: () => NodeActivationId;
  private readonly webhookBasePath: string;
  private readonly runStore: RunStateStore;
  private readonly activationScheduler: NodeActivationScheduler;
  private readonly runDataFactory: RunDataFactory;
  private readonly executionContextFactory: ExecutionContextFactory;
  private readonly eventBus: RunEventBus | undefined;
  private readonly workflowsById = new Map<WorkflowId, WorkflowDefinition>();
  private readonly completionWaiters = new Map<RunId, Array<(result: RunResult) => void>>();

  constructor(
    container: Container,
    host: EngineHost,
    makeRunId: () => RunId,
    makeActivationId: () => NodeActivationId,
    webhookBasePath: string = "/webhooks",
    runStore: RunStateStore = new InMemoryRunStateStore(),
    activationScheduler?: NodeActivationScheduler,
    scheduler: NodeExecutionScheduler = new LocalOnlyScheduler(),
    offloadPolicy: NodeOffloadPolicy = new ConfigDrivenOffloadPolicy(),
    runDataFactory: RunDataFactory = new InMemoryRunDataFactory(),
    executionContextFactory: ExecutionContextFactory = new DefaultExecutionContextFactory(),
    eventBus?: RunEventBus,
  ) {
    this.container = container;
    this.host = host;
    this.makeRunId = makeRunId;
    this.makeActivationId = makeActivationId;
    this.webhookBasePath = webhookBasePath;
    this.runStore = runStore;
    this.runDataFactory = runDataFactory;
    this.executionContextFactory = executionContextFactory;
    this.eventBus = eventBus;

    this.activationScheduler = activationScheduler ?? new DefaultDrivingScheduler(offloadPolicy, scheduler);

    this.activationScheduler.setContinuation?.(this);
  }

  loadWorkflows(workflows: WorkflowDefinition[]): void {
    for (const wf of workflows) this.workflowsById.set(wf.id, wf);
  }

  async startTriggers(): Promise<void> {
    for (const wf of this.workflowsById.values()) {
      for (const def of wf.nodes) {
        if (def.kind !== "trigger") continue;
        const node = this.container.resolve(def.token as any) as TriggerNode;
        const data = this.runDataFactory.create();
        await node.setup({
          ...this.executionContextFactory.create({
            runId: this.makeRunId(),
            workflowId: wf.id,
            parent: undefined,
            services: { credentials: this.host.credentials, workflows: this.host.workflows, container: this.container },
            data,
          }),
          trigger: { workflowId: wf.id, nodeId: def.id },
          config: def.config,
          registerWebhook: (spec) =>
            this.host.registerWebhook({
              workflowId: wf.id,
              nodeId: def.id,
              endpointKey: spec.endpointKey,
              method: spec.method,
              handler: spec.handler,
              basePath: this.webhookBasePath,
            }),
          emit: async (items) => {
            await this.runWorkflow(wf, def.id, items, undefined);
          },
        });
      }
    }
  }

  async start(workflows: WorkflowDefinition[]): Promise<void> {
    this.loadWorkflows(workflows);
    await this.startTriggers();
  }

  async runWorkflow(wf: WorkflowDefinition, startAt: NodeId, items: Items, parent?: ParentExecutionRef): Promise<RunResult> {
    const runId = this.makeRunId();
    const startedAt = new Date().toISOString();
    await this.runStore.createRun({ runId, workflowId: wf.id, startedAt, parent });

    const data = this.runDataFactory.create();
    const base = this.executionContextFactory.create({
      runId,
      workflowId: wf.id,
      parent,
      services: { credentials: this.host.credentials, workflows: this.host.workflows, container: this.container },
      data,
    });

    const topology = WorkflowTopology.fromWorkflow(wf);

    const nodeInstances = new Map<NodeId, unknown>();
    for (const def of wf.nodes) nodeInstances.set(def.id, this.container.resolve(def.token as any));

    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const startDef = topology.defsById.get(startAt);
    if (!startDef) throw new Error(`Unknown start nodeId: ${startAt}`);

    const batchId = "batch_1";
    let queue: RunQueueEntry[] = [];
    const initialNodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot> = {};
    let triggerCompletedSnapshot: NodeExecutionSnapshot | undefined;

    if (startDef.kind === "trigger") {
      const triggerCompletedAt = new Date().toISOString();
      data.setOutputs(startAt, { main: items });
      this.host.onNodeActivation({
        activationId: this.makeActivationId(),
        nodeId: startAt,
        itemsIn: 0,
        itemsOutByPort: { main: items.length },
      });
      triggerCompletedSnapshot = NodeSnapshotFactory.completed({
        runId,
        workflowId: wf.id,
        nodeId: startAt,
        activationId: this.makeActivationId(),
        parent,
        finishedAt: triggerCompletedAt,
        inputsByPort: InputPortMap.empty(),
        outputs: { main: items },
      });
      initialNodeSnapshotsByNodeId[startAt] = triggerCompletedSnapshot;

      queue = planner.seedFromTrigger({ startNodeId: startAt, items, batchId });
    } else {
      queue.push({ nodeId: startAt, input: items, toInput: "in", batchId });
    }

    const next = planner.nextActivation(queue);
    if (!next) {
      const lastNodeId =
        wf.nodes.at(-1)?.id ??
        (() => {
          throw new Error(`Workflow ${wf.id} has no nodes`);
        })();
      const outputs = data.getOutputItems(lastNodeId, "main");
      await this.runStore.save({
        runId,
        workflowId: wf.id,
        startedAt,
        parent,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
      });
      if (triggerCompletedSnapshot) await this.publishNodeEvent("nodeCompleted", triggerCompletedSnapshot);
      const result: RunResult = { runId, workflowId: wf.id, startedAt, status: "completed", outputs };
      this.resolveRunCompletion(result);
      return result;
    }

    const def = topology.defsById.get(next.nodeId);
    if (!def || def.kind !== "node") throw new Error(`Node ${next.nodeId} is not a runnable node`);

    const activationId = this.makeActivationId();
    const ctx: any = { ...base, data, nodeId: def.id, activationId, config: def.config };
    const request: NodeActivationRequest =
      next.kind === "multi"
        ? {
            kind: "multi",
            runId,
            activationId,
            workflowId: wf.id,
            nodeId: def.id,
            parent,
            batchId: next.batchId,
            inputsByPort: next.inputsByPort,
            ctx,
          }
        : {
            kind: "single",
            runId,
            activationId,
            workflowId: wf.id,
            nodeId: def.id,
            parent,
            batchId: next.batchId,
            input: next.input,
            ctx,
          };

    const receipt = await this.activationScheduler.enqueue(request);

    const inputsByPort = InputPortMap.fromRequest(request);
    const itemsIn = next.kind === "multi" ? planner.sumItemsByPort(next.inputsByPort) : next.input.length;
    const enqueuedAt = new Date().toISOString();
    const pending: PendingNodeExecution = {
      runId,
      activationId,
      workflowId: wf.id,
      nodeId: def.id,
      itemsIn,
      inputsByPort,
      receiptId: receipt.receiptId,
      queue: receipt.queue,
      batchId: next.batchId,
      enqueuedAt,
    };
    const queuedSnapshot = NodeSnapshotFactory.queued({
      runId,
      workflowId: wf.id,
      nodeId: def.id,
      activationId,
      parent,
      queuedAt: enqueuedAt,
      inputsByPort,
    });

    await this.runStore.save({
      runId,
      workflowId: wf.id,
      startedAt,
      parent,
      status: "pending",
      pending,
      queue: queue.map((q) => ({ ...q })),
      outputsByNode: data.dump(),
      nodeSnapshotsByNodeId: {
        ...initialNodeSnapshotsByNodeId,
        [def.id]: queuedSnapshot,
      },
    });
    if (triggerCompletedSnapshot) await this.publishNodeEvent("nodeCompleted", triggerCompletedSnapshot);
    await this.publishNodeEvent("nodeQueued", queuedSnapshot);

    return { runId, workflowId: wf.id, startedAt, status: "pending", pending };
  }

  async markNodeRunning(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    inputsByPort: NodeInputsByPort;
  }): Promise<void> {
    const state = await this.runStore.load(args.runId);
    if (!state?.pending) return;
    if (state.pending.activationId !== args.activationId || state.pending.nodeId !== args.nodeId) return;

    const startedAt = new Date().toISOString();
    const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
    const snapshot = NodeSnapshotFactory.running({
      previous,
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: state.parent,
      startedAt,
      inputsByPort: args.inputsByPort,
    });

    await this.runStore.save({
      ...state,
      nodeSnapshotsByNodeId: {
        ...(state.nodeSnapshotsByNodeId ?? {}),
        [args.nodeId]: snapshot,
      },
    });
    await this.publishNodeEvent("nodeStarted", snapshot);
  }

  async resumeFromNodeResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult> {
    const state = await this.runStore.load(args.runId);
    if (!state) throw new Error(`Unknown runId: ${args.runId}`);
    if (state.status !== "pending" || !state.pending) throw new Error(`Run ${args.runId} is not pending`);
    if (state.pending.activationId !== args.activationId) throw new Error(`activationId mismatch for run ${args.runId}`);
    if (state.pending.nodeId !== args.nodeId) throw new Error(`nodeId mismatch for run ${args.runId}`);

    const wf = this.workflowsById.get(state.workflowId);
    if (!wf) throw new Error(`Unknown workflowId: ${state.workflowId}`);

    const topology = WorkflowTopology.fromWorkflow(wf);

    const nodeInstances = new Map<NodeId, unknown>();
    for (const def of wf.nodes) nodeInstances.set(def.id, this.container.resolve(def.token as any));

    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const data = this.runDataFactory.create(state.outputsByNode);
    const base = this.executionContextFactory.create({
      runId: state.runId,
      workflowId: state.workflowId,
      parent: state.parent,
      services: { credentials: this.host.credentials, workflows: this.host.workflows, container: this.container },
      data,
    });

    data.setOutputs(args.nodeId, args.outputs);
    this.host.onNodeActivation({
      activationId: args.activationId,
      nodeId: args.nodeId,
      itemsIn: state.pending.itemsIn,
      itemsOutByPort: OutputStats.toItemsOutByPort(args.outputs),
    } satisfies NodeActivationStats);
    const completedAt = new Date().toISOString();
    const completedSnapshot = NodeSnapshotFactory.completed({
      previous: state.nodeSnapshotsByNodeId?.[args.nodeId],
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: state.parent,
      finishedAt: completedAt,
      inputsByPort: state.pending.inputsByPort,
      outputs: args.outputs,
    });

    const batchId = state.pending.batchId ?? "batch_1";
    const queue: RunQueueEntry[] = (state.queue ?? []).map((q) => ({ ...q, batchId: q.batchId ?? batchId }));

    planner.applyOutputs(queue, { fromNodeId: args.nodeId, outputs: args.outputs as any, batchId });

    const next = planner.nextActivation(queue);
    if (!next) {
      const lastNodeId =
        wf.nodes.at(-1)?.id ??
        (() => {
          throw new Error(`Workflow ${wf.id} has no nodes`);
        })();
      const outputs = data.getOutputItems(lastNodeId, "main");

      await this.runStore.save({
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        parent: state.parent,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(state.nodeSnapshotsByNodeId ?? {}),
          [args.nodeId]: completedSnapshot,
        },
      });
      await this.publishNodeEvent("nodeCompleted", completedSnapshot);

      const result: RunResult = { runId: state.runId, workflowId: state.workflowId, startedAt: state.startedAt, status: "completed", outputs };
      this.resolveRunCompletion(result);
      return result;
    }

    const def = topology.defsById.get(next.nodeId);
    if (!def || def.kind !== "node") throw new Error(`Node ${next.nodeId} is not a runnable node`);

    const activationId = this.makeActivationId();
    const ctx: any = { ...base, data, nodeId: def.id, activationId, config: def.config };
    const request: NodeActivationRequest =
      next.kind === "multi"
        ? {
            kind: "multi",
            runId: state.runId,
            activationId,
            workflowId: state.workflowId,
            nodeId: def.id,
            parent: state.parent,
            batchId: next.batchId,
            inputsByPort: next.inputsByPort,
            ctx,
          }
        : {
            kind: "single",
            runId: state.runId,
            activationId,
            workflowId: state.workflowId,
            nodeId: def.id,
            parent: state.parent,
            batchId: next.batchId,
            input: next.input,
            ctx,
          };

    const receipt = await this.activationScheduler.enqueue(request);

    const inputsByPort = InputPortMap.fromRequest(request);
    const itemsIn = next.kind === "multi" ? planner.sumItemsByPort(next.inputsByPort) : next.input.length;
    const enqueuedAt = new Date().toISOString();
    const pending: PendingNodeExecution = {
      runId: state.runId,
      activationId,
      workflowId: state.workflowId,
      nodeId: def.id,
      itemsIn,
      inputsByPort,
      receiptId: receipt.receiptId,
      queue: receipt.queue,
      batchId: next.batchId,
      enqueuedAt,
    };
    const queuedSnapshot = NodeSnapshotFactory.queued({
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: def.id,
      activationId,
      parent: state.parent,
      queuedAt: enqueuedAt,
      inputsByPort,
    });

    await this.runStore.save({
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      parent: state.parent,
      status: "pending",
      pending,
      queue: queue.map((q) => ({ ...q })),
      outputsByNode: data.dump(),
      nodeSnapshotsByNodeId: {
        ...(state.nodeSnapshotsByNodeId ?? {}),
        [args.nodeId]: completedSnapshot,
        [def.id]: queuedSnapshot,
      },
    });
    await this.publishNodeEvent("nodeCompleted", completedSnapshot);
    await this.publishNodeEvent("nodeQueued", queuedSnapshot);

    return { runId: state.runId, workflowId: state.workflowId, startedAt: state.startedAt, status: "pending", pending };
  }

  async resumeFromNodeError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult> {
    const state = await this.runStore.load(args.runId);
    if (!state) throw new Error(`Unknown runId: ${args.runId}`);
    if (state.status !== "pending" || !state.pending) throw new Error(`Run ${args.runId} is not pending`);
    if (state.pending.activationId !== args.activationId) throw new Error(`activationId mismatch for run ${args.runId}`);
    if (state.pending.nodeId !== args.nodeId) throw new Error(`nodeId mismatch for run ${args.runId}`);

    const message = args.error?.message ?? String(args.error);
    const failedSnapshot = NodeSnapshotFactory.failed({
      previous: state.nodeSnapshotsByNodeId?.[args.nodeId],
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: state.parent,
      finishedAt: new Date().toISOString(),
      inputsByPort: state.pending.inputsByPort,
      error: args.error,
    });
    await this.runStore.save({
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      parent: state.parent,
      status: "failed",
      pending: undefined,
      queue: (state.queue ?? []).map((q) => ({ ...q })),
      outputsByNode: state.outputsByNode,
      nodeSnapshotsByNodeId: {
        ...(state.nodeSnapshotsByNodeId ?? {}),
        [args.nodeId]: failedSnapshot,
      },
    });
    await this.publishNodeEvent("nodeFailed", failedSnapshot);

    const result: RunResult = { runId: state.runId, workflowId: state.workflowId, startedAt: state.startedAt, status: "failed", error: { message } };
    this.resolveRunCompletion(result);
    return result;
  }

  async resumeFromStepResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult> {
    return await this.resumeFromNodeResult(args);
  }

  async resumeFromStepError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult> {
    return await this.resumeFromNodeError(args);
  }

  async waitForCompletion(runId: RunId): Promise<Extract<RunResult, { status: "completed" | "failed" }>> {
    const existing = await this.runStore.load(runId);
    if (existing?.status === "completed") {
      const wf = this.workflowsById.get(existing.workflowId);
      const lastNodeId = wf?.nodes.at(-1)?.id;
      const data = this.runDataFactory.create(existing.outputsByNode);
      const outputs = lastNodeId ? data.getOutputItems(lastNodeId, "main") : [];
      return { runId: existing.runId, workflowId: existing.workflowId, startedAt: existing.startedAt, status: "completed", outputs };
    }
    if (existing?.status === "failed") {
      return { runId: existing.runId, workflowId: existing.workflowId, startedAt: existing.startedAt, status: "failed", error: { message: "Run failed" } };
    }

    return await new Promise((resolve) => {
      const list = this.completionWaiters.get(runId) ?? [];
      list.push((r) => resolve(r as any));
      this.completionWaiters.set(runId, list);
    });
  }

  private async publishNodeEvent(kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed", snapshot: NodeExecutionSnapshot): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish({
      kind,
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      parent: snapshot.parent,
      at: snapshot.updatedAt,
      snapshot,
    });
  }

  private resolveRunCompletion(result: RunResult): void {
    if (result.status !== "completed" && result.status !== "failed") return;
    const list = this.completionWaiters.get(result.runId);
    if (!list || list.length === 0) return;
    this.completionWaiters.delete(result.runId);
    for (const r of list) r(result);
  }
}

export class EngineWorkflowRunnerService {
  constructor(
    private readonly engine: Engine,
    private readonly workflowsById: Map<WorkflowId, WorkflowDefinition>,
  ) {}

  async runById(args: { workflowId: WorkflowId; startAt?: NodeId; items: Items; parent?: ParentExecutionRef }): Promise<RunResult> {
    const { workflowId, startAt, items, parent } = args;
    const wf = this.workflowsById.get(workflowId);
    if (!wf) throw new Error(`Unknown workflowId: ${workflowId}`);

    const startNodeId = startAt ?? this.findDefaultStartNodeId(wf);
    const scheduled = await this.engine.runWorkflow(wf, startNodeId, items, parent);
    if (scheduled.status !== "pending") return scheduled;
    return await this.engine.waitForCompletion(scheduled.runId);
  }

  private findDefaultStartNodeId(wf: WorkflowDefinition): NodeId {
    const firstTrigger = wf.nodes.find((n) => n.kind === "trigger")?.id;
    if (firstTrigger) return firstTrigger;

    const incoming = new Map<NodeId, number>();
    for (const n of wf.nodes) incoming.set(n.id, 0);
    for (const e of wf.edges) incoming.set(e.to.nodeId, (incoming.get(e.to.nodeId) ?? 0) + 1);

    const start = wf.nodes.find((n) => (incoming.get(n.id) ?? 0) === 0)?.id;
    return (
      start ??
      wf.nodes[0]?.id ??
      (() => {
        throw new Error(`Workflow ${wf.id} has no nodes`);
      })()
    );
  }
}


import type {
  ActivationIdFactory,
  CredentialService,
  EngineDeps,
  ExecutableTriggerNode,
  ExecutionContextFactory,
  Items,
  NodeActivationContinuation,
  NodeActivationId,
  NodeActivationObserver,
  NodeActivationRequest,
  NodeActivationScheduler,
  NodeExecutionSnapshot,
  NodeExecutionStatePublisher,
  NodeActivationStats,
  NodeId,
  NodeResolver,
  NodeInputsByPort,
  NodeOutputs,
  OutputPortKey,
  ParentExecutionRef,
  PendingNodeExecution,
  RunExecutionOptions,
  RunDataFactory,
  RunQueueEntry,
  RunId,
  RunIdFactory,
  RunResult,
  RunStateStore,
  TriggerNode,
  WebhookControlSignal,
  WebhookRegistrar,
  WebhookRunResult,
  WorkflowDefinition,
  WorkflowId,
  WorkflowRegistry,
  WorkflowRunnerResolver,
} from "../../types";
import type { RunEventBus } from "../../events";
import { RunQueuePlanner } from "../planning/runQueuePlanner";
import { WorkflowTopology } from "../planning/workflowTopology";
import {
  MissingRuntimeExecutionMarker,
  MissingRuntimeNode,
  MissingRuntimeNodeToken,
  MissingRuntimeTrigger,
  MissingRuntimeTriggerToken,
  PersistedWorkflowResolver,
  PersistedWorkflowSnapshotFactory,
  PersistedWorkflowTokenRegistry,
} from "./persistedWorkflowResolver";

class OutputStats {
  static toItemsOutByPort(outputs: NodeOutputs): Record<OutputPortKey, number> {
    const out: Record<OutputPortKey, number> = {};
    for (const [port, produced] of Object.entries(outputs)) out[port] = produced?.length ?? 0;
    return out;
  }
}

class RuntimeContinuationDiagnostics {
  static formatNodeLabel(args: { definition?: Readonly<{ id: NodeId; name?: string; type: unknown }>; nodeId: NodeId }): string {
    const tokenName = typeof args.definition?.type === "function" ? args.definition.type.name : "Node";
    return args.definition?.name ? `"${args.definition.name}" (${tokenName}:${args.nodeId})` : `${tokenName}:${args.nodeId}`;
  }

  static formatOutputCounts(outputs: NodeOutputs): string {
    const entries = Object.entries(outputs ?? {});
    if (entries.length === 0) return "no outputs";
    return entries.map(([port, items]) => `${port}=${items?.length ?? 0}`).join(", ");
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

  static skipped(args: {
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
      status: "skipped",
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
      error: {
        message: args.error.message,
        name: args.error.name,
        stack: args.error.stack,
      },
    };
  }
}

class BoundNodeExecutionStatePublisher implements NodeExecutionStatePublisher {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly runStore: RunStateStore,
    private readonly runId: RunId,
    private readonly workflowId: WorkflowId,
    private readonly parent: ParentExecutionRef | undefined,
    private readonly publishNodeEvent: (kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed", snapshot: NodeExecutionSnapshot) => Promise<void>,
  ) {}

  markQueued(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const queuedAt = new Date().toISOString();
      const snapshot = NodeSnapshotFactory.queued({
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        queuedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? InputPortMap.empty(),
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeQueued", snapshot);
    });
  }

  markRunning(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const startedAt = new Date().toISOString();
      const snapshot = NodeSnapshotFactory.running({
        previous,
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        startedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? InputPortMap.empty(),
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeStarted", snapshot);
    });
  }

  markCompleted(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort; outputs?: NodeOutputs }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const finishedAt = new Date().toISOString();
      const snapshot = NodeSnapshotFactory.completed({
        previous,
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        finishedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? InputPortMap.empty(),
        outputs: args.outputs ?? previous?.outputs ?? {},
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeCompleted", snapshot);
    });
  }

  markFailed(args: { nodeId: NodeId; activationId?: NodeActivationId; inputsByPort?: NodeInputsByPort; error: Error }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const finishedAt = new Date().toISOString();
      const snapshot = NodeSnapshotFactory.failed({
        previous,
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        finishedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? InputPortMap.empty(),
        error: args.error,
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeFailed", snapshot);
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.chain.then(work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async loadState(): Promise<NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>> {
    const state = await this.runStore.load(this.runId);
    if (!state) throw new Error(`Unknown runId: ${this.runId}`);
    return state;
  }

  private async saveSnapshot(state: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>, snapshot: NodeExecutionSnapshot): Promise<void> {
    await this.runStore.save({
      ...state,
      nodeSnapshotsByNodeId: {
        ...(state.nodeSnapshotsByNodeId ?? {}),
        [snapshot.nodeId]: snapshot,
      },
    });
  }
}

export class Engine implements NodeActivationContinuation {
  private readonly credentials: CredentialService;
  private readonly workflowRunnerResolver: WorkflowRunnerResolver;
  private readonly workflowRegistry: WorkflowRegistry;
  private readonly nodeResolver: NodeResolver;
  private readonly webhookRegistrar: WebhookRegistrar;
  private readonly nodeActivationObserver: NodeActivationObserver;
  private readonly runIdFactory: RunIdFactory;
  private readonly activationIdFactory: ActivationIdFactory;
  private readonly webhookBasePath: string;
  private readonly runStore: RunStateStore;
  private readonly activationScheduler: NodeActivationScheduler;
  private readonly runDataFactory: RunDataFactory;
  private readonly executionContextFactory: ExecutionContextFactory;
  private readonly eventBus: RunEventBus | undefined;
  private readonly workflowSnapshotFactory: PersistedWorkflowSnapshotFactory;
  private readonly persistedWorkflowResolver: PersistedWorkflowResolver;
  private readonly completionWaiters = new Map<RunId, Array<(result: RunResult) => void>>();
  private readonly webhookResponseWaiters = new Map<RunId, Array<(result: WebhookRunResult) => void>>();

  constructor(deps: EngineDeps) {
    this.credentials = deps.credentials;
    this.workflowRunnerResolver = deps.workflowRunnerResolver;
    this.workflowRegistry = deps.workflowRegistry;
    this.nodeResolver = deps.nodeResolver;
    this.webhookRegistrar = deps.webhookRegistrar;
    this.nodeActivationObserver = deps.nodeActivationObserver;
    this.runIdFactory = deps.runIdFactory;
    this.activationIdFactory = deps.activationIdFactory;
    this.webhookBasePath = deps.webhookBasePath ?? "/webhooks";
    this.runStore = deps.runStore;
    this.activationScheduler = deps.activationScheduler;
    this.runDataFactory = deps.runDataFactory;
    this.executionContextFactory = deps.executionContextFactory;
    this.eventBus = deps.eventBus;
    const tokenRegistry = deps.tokenRegistry ?? new PersistedWorkflowTokenRegistry();
    this.workflowSnapshotFactory = new PersistedWorkflowSnapshotFactory(tokenRegistry);
    this.persistedWorkflowResolver = new PersistedWorkflowResolver(this.workflowRegistry, tokenRegistry);
    this.tokenRegistry = tokenRegistry;
    this.activationScheduler.setContinuation?.(this);
  }

  private readonly tokenRegistry: PersistedWorkflowTokenRegistry;

  loadWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    if (this.tokenRegistry.registerFromWorkflows) {
      this.tokenRegistry.registerFromWorkflows(workflows);
    }
    this.workflowRegistry.setWorkflows(workflows);
  }

  async startTriggers(): Promise<void> {
    for (const wf of this.workflowRegistry.list()) {
      for (const def of wf.nodes) {
        if (def.kind !== "trigger") continue;
        const node = this.nodeResolver.resolve(def.type) as TriggerNode;
        const data = this.runDataFactory.create();
        const triggerRunId = this.runIdFactory.makeRunId();
        await node.setup({
          ...this.executionContextFactory.create({
            runId: triggerRunId,
            workflowId: wf.id,
            parent: undefined,
            services: this.createExecutionServices(triggerRunId, wf.id, undefined),
            data,
          }),
          trigger: { workflowId: wf.id, nodeId: def.id },
          config: def.config,
          registerWebhook: (spec) =>
            this.webhookRegistrar.registerWebhook({
              workflowId: wf.id,
              nodeId: def.id,
              endpointKey: spec.endpointKey,
              methods: spec.methods,
              parseJsonBody: spec.parseJsonBody,
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

  async runWorkflow(
    wf: WorkflowDefinition,
    startAt: NodeId,
    items: Items,
    parent?: ParentExecutionRef,
    executionOptions?: RunExecutionOptions,
    persistedStateOverrides?: Readonly<{
      workflowSnapshot?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
      mutableState?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    }>,
  ): Promise<RunResult> {
    const runId = this.runIdFactory.makeRunId();
    const startedAt = new Date().toISOString();
    await this.runStore.createRun({
      runId,
      workflowId: wf.id,
      startedAt,
      parent,
      executionOptions,
      workflowSnapshot: persistedStateOverrides?.workflowSnapshot ?? this.workflowSnapshotFactory.create(wf),
      mutableState: persistedStateOverrides?.mutableState,
    });

    const data = this.runDataFactory.create();
    const base = this.executionContextFactory.create({
      runId,
      workflowId: wf.id,
      parent,
      services: this.createExecutionServices(runId, wf.id, parent),
      data,
    });

    const topology = WorkflowTopology.fromWorkflow(wf);

    const nodeInstances = new Map<NodeId, unknown>();
    for (const def of wf.nodes) nodeInstances.set(def.id, this.createNodeInstance(def));

    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const startDef = topology.defsById.get(startAt);
    if (!startDef) throw new Error(`Unknown start nodeId: ${startAt}`);

    const batchId = "batch_1";
    let queue: RunQueueEntry[] = [];
    const initialNodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot> = {};
    let triggerCompletedSnapshot: NodeExecutionSnapshot | undefined;

    if (startDef.kind === "trigger" && this.isExecutableTriggerNode(nodeInstances.get(startAt))) {
      const activationId = this.activationIdFactory.makeActivationId();
      const ctx: any = { ...base, data, nodeId: startDef.id, activationId, config: startDef.config };
      const request: NodeActivationRequest = {
        kind: "single",
        runId,
        activationId,
        workflowId: wf.id,
        nodeId: startDef.id,
        parent,
        executionOptions,
        batchId,
        input: items,
        ctx,
      };
      const receipt = await this.activationScheduler.enqueue(request);
      const inputsByPort = InputPortMap.fromRequest(request);
      const enqueuedAt = new Date().toISOString();
      const pending: PendingNodeExecution = {
        runId,
        activationId,
        workflowId: wf.id,
        nodeId: startDef.id,
        itemsIn: items.length,
        inputsByPort,
        receiptId: receipt.receiptId,
        queue: receipt.queue,
        batchId,
        enqueuedAt,
      };
      const queuedSnapshot = NodeSnapshotFactory.queued({
        runId,
        workflowId: wf.id,
        nodeId: startDef.id,
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
        executionOptions,
        workflowSnapshot: persistedStateOverrides?.workflowSnapshot ?? this.workflowSnapshotFactory.create(wf),
        mutableState: persistedStateOverrides?.mutableState,
        status: "pending",
        pending,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          [startDef.id]: queuedSnapshot,
        },
      });
      await this.publishNodeEvent("nodeQueued", queuedSnapshot);

      return { runId, workflowId: wf.id, startedAt, status: "pending", pending };
    } else if (startDef.kind === "trigger") {
      const triggerCompletedAt = new Date().toISOString();
      data.setOutputs(startAt, { main: items });
      this.nodeActivationObserver.onNodeActivation({
        activationId: this.activationIdFactory.makeActivationId(),
        nodeId: startAt,
        itemsIn: 0,
        itemsOutByPort: { main: items.length },
      });
      triggerCompletedSnapshot = NodeSnapshotFactory.completed({
        runId,
        workflowId: wf.id,
        nodeId: startAt,
        activationId: this.activationIdFactory.makeActivationId(),
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
        executionOptions,
        workflowSnapshot: persistedStateOverrides?.workflowSnapshot ?? this.workflowSnapshotFactory.create(wf),
        mutableState: persistedStateOverrides?.mutableState,
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

    const activationId = this.activationIdFactory.makeActivationId();
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
            executionOptions,
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
            executionOptions,
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
      executionOptions,
      workflowSnapshot: persistedStateOverrides?.workflowSnapshot ?? this.workflowSnapshotFactory.create(wf),
      mutableState: persistedStateOverrides?.mutableState,
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

    const wf = this.resolvePersistedWorkflow(state);
    if (!wf) throw new Error(`Unknown workflowId: ${state.workflowId}`);

    const topology = WorkflowTopology.fromWorkflow(wf);

    const nodeInstances = new Map<NodeId, unknown>();
    for (const def of wf.nodes) nodeInstances.set(def.id, this.createNodeInstance(def));

    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const data = this.runDataFactory.create(state.outputsByNode);
    const base = this.executionContextFactory.create({
      runId: state.runId,
      workflowId: state.workflowId,
      parent: state.parent,
      services: this.createExecutionServices(state.runId, state.workflowId, state.parent),
      data,
    });

    data.setOutputs(args.nodeId, args.outputs);
    this.nodeActivationObserver.onNodeActivation({
      activationId: args.activationId,
      nodeId: args.nodeId,
      itemsIn: state.pending.itemsIn,
      itemsOutByPort: OutputStats.toItemsOutByPort(args.outputs),
    } satisfies NodeActivationStats);
    const completedAt = new Date().toISOString();
    const completedSnapshot = this.createFinishedSnapshot({
      workflow: wf,
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

    let next: ReturnType<RunQueuePlanner["nextActivation"]>;
    try {
      next = planner.nextActivation(queue);
    } catch (cause) {
      const completedDefinition = topology.defsById.get(args.nodeId);
      const completedNodeLabel = RuntimeContinuationDiagnostics.formatNodeLabel({ definition: completedDefinition, nodeId: args.nodeId });
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `After completing ${completedNodeLabel}, the engine could not plan the next activation. ${reason} Outputs: ${RuntimeContinuationDiagnostics.formatOutputCounts(args.outputs)}.`,
        { cause },
      );
    }
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
        executionOptions: state.executionOptions,
        workflowSnapshot: state.workflowSnapshot,
        mutableState: state.mutableState,
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

    const activationId = this.activationIdFactory.makeActivationId();
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
            executionOptions: state.executionOptions,
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
            executionOptions: state.executionOptions,
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
      executionOptions: state.executionOptions,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
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

    const wf = this.resolvePersistedWorkflow(state);
    if (!wf) throw new Error(`Unknown workflowId: ${state.workflowId}`);
    const failedDefinition = WorkflowTopology.fromWorkflow(wf).defsById.get(args.nodeId);
    const webhookControlSignal =
      state.executionOptions?.webhook && failedDefinition?.kind === "trigger" ? this.asWebhookControlSignal(args.error) : undefined;
    if (webhookControlSignal) {
      return await this.resumeFromWebhookControl({ state, workflow: wf, args, signal: webhookControlSignal });
    }

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
      executionOptions: state.executionOptions,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
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
      const wf = this.resolvePersistedWorkflow(existing);
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

  async waitForWebhookResponse(runId: RunId): Promise<WebhookRunResult> {
    return await new Promise((resolve) => {
      const list = this.webhookResponseWaiters.get(runId) ?? [];
      list.push(resolve);
      this.webhookResponseWaiters.set(runId, list);
    });
  }

  private async resumeFromWebhookControl(args: {
    state: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>;
    workflow: WorkflowDefinition;
    args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error };
    signal: WebhookControlSignal;
  }): Promise<RunResult> {
    const data = this.runDataFactory.create(args.state.outputsByNode);
    const topology = WorkflowTopology.fromWorkflow(args.workflow);
    const nodeInstances = new Map<NodeId, unknown>();
    for (const definition of args.workflow.nodes) nodeInstances.set(definition.id, this.createNodeInstance(definition));
    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const continuedItems = args.signal.kind === "respondNowAndContinue" ? (args.signal.continueItems ?? []) : args.signal.responseItems;
    const triggerOutputs: NodeOutputs = { main: continuedItems };
    data.setOutputs(args.args.nodeId, triggerOutputs);
    this.nodeActivationObserver.onNodeActivation({
      activationId: args.args.activationId,
      nodeId: args.args.nodeId,
      itemsIn: args.state.pending?.itemsIn ?? 0,
      itemsOutByPort: OutputStats.toItemsOutByPort(triggerOutputs),
    });

    const completedSnapshot = this.createFinishedSnapshot({
      workflow: args.workflow,
      previous: args.state.nodeSnapshotsByNodeId?.[args.args.nodeId],
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      nodeId: args.args.nodeId,
      activationId: args.args.activationId,
      parent: args.state.parent,
      finishedAt: new Date().toISOString(),
      inputsByPort: args.state.pending?.inputsByPort ?? InputPortMap.empty(),
      outputs: triggerOutputs,
    });

    if (args.signal.kind === "respondNow") {
      await this.runStore.save({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        workflowSnapshot: args.state.workflowSnapshot,
        mutableState: args.state.mutableState,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
      });
      await this.publishNodeEvent("nodeCompleted", completedSnapshot);

      const result: RunResult = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        status: "completed",
        outputs: args.signal.responseItems,
      };
      this.resolveWebhookResponse({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        runStatus: "completed",
        response: args.signal.responseItems,
      });
      this.resolveRunCompletion(result);
      return result;
    }

    const batchId = args.state.pending?.batchId ?? "batch_1";
    const queue: RunQueueEntry[] = (args.state.queue ?? []).map((entry) => ({ ...entry, batchId: entry.batchId ?? batchId }));
    planner.applyOutputs(queue, { fromNodeId: args.args.nodeId, outputs: triggerOutputs as any, batchId });
    const next = planner.nextActivation(queue);

    if (!next) {
      const lastNodeId =
        args.workflow.nodes.at(-1)?.id ??
        (() => {
          throw new Error(`Workflow ${args.workflow.id} has no nodes`);
        })();
      const outputs = data.getOutputItems(lastNodeId, "main");
      await this.runStore.save({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        workflowSnapshot: args.state.workflowSnapshot,
        mutableState: args.state.mutableState,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
      });
      await this.publishNodeEvent("nodeCompleted", completedSnapshot);

      const result: RunResult = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        status: "completed",
        outputs,
      };
      this.resolveWebhookResponse({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        runStatus: "completed",
        response: args.signal.responseItems,
      });
      this.resolveRunCompletion(result);
      return result;
    }

    const nextDefinition = topology.defsById.get(next.nodeId);
    if (!nextDefinition || nextDefinition.kind !== "node") {
      throw new Error(`Node ${next.nodeId} is not a runnable node`);
    }

    const base = this.executionContextFactory.create({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      parent: args.state.parent,
      services: this.createExecutionServices(args.state.runId, args.state.workflowId, args.state.parent),
      data,
    });
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: any = { ...base, data, nodeId: nextDefinition.id, activationId, config: nextDefinition.config };
    const request: NodeActivationRequest =
      next.kind === "multi"
        ? {
            kind: "multi",
            runId: args.state.runId,
            activationId,
            workflowId: args.state.workflowId,
            nodeId: nextDefinition.id,
            parent: args.state.parent,
            executionOptions: args.state.executionOptions,
            batchId: next.batchId,
            inputsByPort: next.inputsByPort,
            ctx,
          }
        : {
            kind: "single",
            runId: args.state.runId,
            activationId,
            workflowId: args.state.workflowId,
            nodeId: nextDefinition.id,
            parent: args.state.parent,
            executionOptions: args.state.executionOptions,
            batchId: next.batchId,
            input: next.input,
            ctx,
          };
    const receipt = await this.activationScheduler.enqueue(request);
    const inputsByPort = InputPortMap.fromRequest(request);
    const itemsIn = next.kind === "multi" ? planner.sumItemsByPort(next.inputsByPort) : next.input.length;
    const enqueuedAt = new Date().toISOString();
    const pending: PendingNodeExecution = {
      runId: args.state.runId,
      activationId,
      workflowId: args.state.workflowId,
      nodeId: nextDefinition.id,
      itemsIn,
      inputsByPort,
      receiptId: receipt.receiptId,
      queue: receipt.queue,
      batchId: next.batchId,
      enqueuedAt,
    };
    const queuedSnapshot = NodeSnapshotFactory.queued({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      nodeId: nextDefinition.id,
      activationId,
      parent: args.state.parent,
      queuedAt: enqueuedAt,
      inputsByPort,
    });

    await this.runStore.save({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      startedAt: args.state.startedAt,
      parent: args.state.parent,
      executionOptions: args.state.executionOptions,
      workflowSnapshot: args.state.workflowSnapshot,
      mutableState: args.state.mutableState,
      status: "pending",
      pending,
      queue: queue.map((entry) => ({ ...entry })),
      outputsByNode: data.dump(),
      nodeSnapshotsByNodeId: {
        ...(args.state.nodeSnapshotsByNodeId ?? {}),
        [args.args.nodeId]: completedSnapshot,
        [nextDefinition.id]: queuedSnapshot,
      },
    });
    await this.publishNodeEvent("nodeCompleted", completedSnapshot);
    await this.publishNodeEvent("nodeQueued", queuedSnapshot);
    this.resolveWebhookResponse({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      startedAt: args.state.startedAt,
      runStatus: "pending",
      response: args.signal.responseItems,
    });

    return { runId: args.state.runId, workflowId: args.state.workflowId, startedAt: args.state.startedAt, status: "pending", pending };
  }

  private asWebhookControlSignal(error: Error): WebhookControlSignal | undefined {
    const candidate = error as Partial<WebhookControlSignal> | undefined;
    if (!candidate || candidate.__webhookControl !== true) return undefined;
    if (candidate.kind !== "respondNow" && candidate.kind !== "respondNowAndContinue") return undefined;
    if (!Array.isArray(candidate.responseItems)) return undefined;
    return candidate as WebhookControlSignal;
  }

  private isExecutableTriggerNode(node: unknown): boolean {
    return typeof (node as Partial<ExecutableTriggerNode> | undefined)?.execute === "function";
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

  private resolvePersistedWorkflow(state: { workflowId: WorkflowId; workflowSnapshot?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"] }): WorkflowDefinition | undefined {
    return this.persistedWorkflowResolver.resolve({
      workflowId: state.workflowId,
      workflowSnapshot: state.workflowSnapshot,
    });
  }

  private createNodeInstance(definition: WorkflowDefinition["nodes"][number]): unknown {
    if (definition.type === MissingRuntimeNodeToken) {
      return new MissingRuntimeNode();
    }
    if (definition.type === MissingRuntimeTriggerToken) {
      return new MissingRuntimeTrigger();
    }
    return this.nodeResolver.resolve(definition.type);
  }

  private createFinishedSnapshot(args: {
    workflow: WorkflowDefinition;
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
    const definition = args.workflow.nodes.find((node) => node.id === args.nodeId);
    if (MissingRuntimeExecutionMarker.isMarked(definition?.config)) {
      return NodeSnapshotFactory.skipped(args);
    }
    return NodeSnapshotFactory.completed(args);
  }

  private createExecutionServices(runId: RunId, workflowId: WorkflowId, parent: ParentExecutionRef | undefined) {
    return {
      credentials: this.credentials,
      workflows: this.workflowRunnerResolver.resolve(),
      nodeResolver: this.nodeResolver,
      container: this.nodeResolver.getContainer(),
      nodeState: new BoundNodeExecutionStatePublisher(this.runStore, runId, workflowId, parent, async (kind, snapshot) => {
        await this.publishNodeEvent(kind, snapshot);
      }),
    };
  }

  private resolveRunCompletion(result: RunResult): void {
    if (result.status !== "completed" && result.status !== "failed") return;
    const list = this.completionWaiters.get(result.runId);
    if (!list || list.length === 0) return;
    this.completionWaiters.delete(result.runId);
    for (const r of list) r(result);
  }

  private resolveWebhookResponse(result: WebhookRunResult): void {
    const list = this.webhookResponseWaiters.get(result.runId);
    if (!list || list.length === 0) return;
    this.webhookResponseWaiters.delete(result.runId);
    for (const resolve of list) resolve(result);
  }
}

export class EngineWorkflowRunnerService {
  constructor(private readonly engine: Engine, private readonly workflowRegistry: WorkflowRegistry) {}

  async runById(args: { workflowId: WorkflowId; startAt?: NodeId; items: Items; parent?: ParentExecutionRef }): Promise<RunResult> {
    const { workflowId, startAt, items, parent } = args;
    const wf = this.workflowRegistry.get(workflowId);
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


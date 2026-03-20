import type {
ActivationIdFactory,
CredentialSessionService,
CurrentStateExecutionRequest,
EngineDeps,
ExecutionContextFactory,
ExecutionFrontierPlan,
Items,
JsonValue,
NodeActivationContinuation,
NodeActivationId,
NodeActivationObserver,
NodeActivationRequest,
NodeActivationScheduler,
NodeActivationStats,
NodeExecutionContext,
NodeExecutionSnapshot,
NodeExecutionStatePublisher,
NodeId,
NodeInputsByPort,
NodeOutputs,
NodeResolver,
ParentExecutionRef,
PendingNodeExecution,
PersistedRunControlState,
RunCurrentState,
RunDataFactory,
RunExecutionOptions,
RunId,
RunIdFactory,
RunQueueEntry,
RunResult,
RunStateStore,
TestableTriggerNode,
TriggerCleanupHandle,
TriggerInstanceId,
TriggerNode,
TriggerNodeConfig,
TriggerSetupStateStore,
WebhookControlSignal,
WebhookRegistrar,
WebhookRunResult,
WebhookTriggerMatcher,
WorkflowDefinition,
WorkflowId,
WorkflowRegistry,
WorkflowRunnerResolver,
} from "../../types";


import type { RunEventBus } from "../../events";


import { CurrentStateFrontierPlanner } from "../planning/currentStateFrontierPlanner";


import { RunQueuePlanner } from "../planning/runQueuePlanner";


import { WorkflowTopology } from "../planning/WorkflowTopologyPlanner";


import { BoundNodeExecutionStatePublisher } from "./BoundNodeExecutionStatePublisher";


import { InMemoryWebhookTriggerMatcher } from "./InMemoryWebhookTriggerMatcher";


import { InputPortMap } from "./InputPortMapFactory";


import { NodeInstanceFactory } from "./NodeInstanceFactory";


import { NodeSnapshotFactory } from "./NodeSnapshotFactory";


import { OutputStats } from "./OutputStatsReporter";


import {
MissingRuntimeExecutionMarker,
PersistedWorkflowResolver,
PersistedWorkflowSnapshotFactory,
PersistedWorkflowTokenRegistry,
PersistedWorkflowTokenRegistryFromLikeFactory,
} from "./persistedWorkflowResolver";


import { RuntimeContinuationDiagnostics } from "./RuntimeContinuationDiagnosticsReporter";



export class Engine implements NodeActivationContinuation {
  private readonly credentialSessions: CredentialSessionService;
  private readonly workflowRunnerResolver: WorkflowRunnerResolver;
  private readonly workflowRegistry: WorkflowRegistry;
  private readonly nodeResolver: NodeResolver;
  private readonly webhookRegistrar: WebhookRegistrar;
  private readonly triggerSetupStateStore: TriggerSetupStateStore;
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
  private readonly webhookTriggerMatcher: WebhookTriggerMatcher;
  private readonly nodeInstanceFactory: NodeInstanceFactory;
  private readonly completionWaiters = new Map<RunId, Array<(result: RunResult) => void>>();
  private readonly webhookResponseWaiters = new Map<RunId, Array<(result: WebhookRunResult) => void>>();
  private readonly triggerCleanupHandlesByKey = new Map<string, TriggerCleanupHandle[]>();

  constructor(deps: EngineDeps) {
    this.credentialSessions = deps.credentialSessions;
    this.workflowRunnerResolver = deps.workflowRunnerResolver;
    this.workflowRegistry = deps.workflowRegistry;
    this.nodeResolver = deps.nodeResolver;
    this.webhookRegistrar = deps.webhookRegistrar;
    this.triggerSetupStateStore = deps.triggerSetupStateStore;
    this.nodeActivationObserver = deps.nodeActivationObserver;
    this.runIdFactory = deps.runIdFactory;
    this.activationIdFactory = deps.activationIdFactory;
    this.webhookBasePath = deps.webhookBasePath ?? "/webhooks";
    this.runStore = deps.runStore;
    this.activationScheduler = deps.activationScheduler;
    this.runDataFactory = deps.runDataFactory;
    this.executionContextFactory = deps.executionContextFactory;
    this.eventBus = deps.eventBus;
    this.webhookTriggerMatcher = deps.webhookTriggerMatcher ?? new InMemoryWebhookTriggerMatcher();
    this.nodeInstanceFactory = new NodeInstanceFactory(this.nodeResolver);
    const tokenRegistry = deps.tokenRegistry
      ? PersistedWorkflowTokenRegistryFromLikeFactory.fromLike(deps.tokenRegistry)
      : new PersistedWorkflowTokenRegistry();
    this.workflowSnapshotFactory = new PersistedWorkflowSnapshotFactory(tokenRegistry);
    this.persistedWorkflowResolver = new PersistedWorkflowResolver(this.workflowRegistry, tokenRegistry);
    this.tokenRegistry = tokenRegistry;
    this.activationScheduler.setContinuation?.(this);
  }

  private readonly tokenRegistry: PersistedWorkflowTokenRegistry;

  loadWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    this.tokenRegistry.registerFromWorkflows(workflows);
    this.workflowRegistry.setWorkflows(workflows);
  }

  getTokenRegistry(): PersistedWorkflowTokenRegistry {
    return this.tokenRegistry;
  }

  resolveWorkflowSnapshot(args: {
    workflowId: WorkflowId;
    workflowSnapshot?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
  }): WorkflowDefinition | undefined {
    return this.persistedWorkflowResolver.resolve(args);
  }

  async startTriggers(): Promise<void> {
    for (const wf of this.workflowRegistry.list()) {
      for (const def of wf.nodes) {
        if (def.kind !== "trigger") continue;
        const node = this.nodeResolver.resolve(def.type) as TriggerNode;
        const data = this.runDataFactory.create();
        const triggerRunId = this.runIdFactory.makeRunId();
        const trigger = { workflowId: wf.id, nodeId: def.id } as const;
        await this.stopTrigger(trigger);
        const previousState = await this.triggerSetupStateStore.load(trigger);
        let nextState: unknown;
        try {
          nextState = await node.setup({
            ...this.createExecutionContext({
              runId: triggerRunId,
              workflowId: wf.id,
              nodeId: def.id,
              parent: undefined,
              data,
              nodeState: this.createNodeStatePublisher(triggerRunId, wf.id, undefined),
            }),
            trigger,
            config: def.config as TriggerNodeConfig,
            previousState: previousState?.state as never,
            registerCleanup: (cleanup) => {
              this.registerTriggerCleanupHandle(trigger, cleanup);
            },
            registerWebhook: (spec) => {
              const registration = this.webhookRegistrar.registerWebhook({
                workflowId: wf.id,
                nodeId: def.id,
                endpointKey: spec.endpointKey,
                methods: spec.methods,
                parseJsonBody: spec.parseJsonBody,
                basePath: this.webhookBasePath,
              });
              this.webhookTriggerMatcher.register({
                workflowId: wf.id,
                nodeId: def.id,
                endpointId: registration.endpointId,
                methods: registration.methods,
                parseJsonBody: spec.parseJsonBody,
              });
              return registration;
            },
            emit: async (items) => {
              await this.runWorkflow(wf, def.id, items, undefined);
            },
          });
        } catch (triggerError: unknown) {
          await this.stopTrigger(trigger);
          const message =
            triggerError instanceof Error ? triggerError.message : String(triggerError);
          console.warn(
            `[engine] Skipping trigger setup for workflow ${wf.id} node ${def.id}: ${message}`,
          );
          continue;
        }
        if (nextState === undefined) {
          await this.triggerSetupStateStore.delete(trigger);
        } else {
          await this.triggerSetupStateStore.save({
            trigger,
            updatedAt: new Date().toISOString(),
            state: nextState as JsonValue | undefined,
          });
        }
      }
    }
  }

  async start(workflows: WorkflowDefinition[]): Promise<void> {
    await this.stop();
    this.loadWorkflows(workflows);
    await this.startTriggers();
  }

  async stop(): Promise<void> {
    for (const workflow of this.workflowRegistry.list()) {
      for (const node of workflow.nodes) {
        if (node.kind !== "trigger") {
          continue;
        }
        await this.stopTrigger({
          workflowId: workflow.id,
          nodeId: node.id,
        });
      }
    }
    await this.webhookRegistrar.clear?.();
    this.webhookTriggerMatcher.clear?.();
  }

  matchWebhookTrigger(args: { endpointId: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" }) {
    return this.webhookTriggerMatcher.match(args);
  }

  findWebhookTrigger(endpointId: string) {
    return this.webhookTriggerMatcher.lookup(endpointId);
  }

  private registerTriggerCleanupHandle(trigger: TriggerInstanceId, cleanup: TriggerCleanupHandle): void {
    const key = this.toTriggerKey(trigger);
    const cleanups = this.triggerCleanupHandlesByKey.get(key) ?? [];
    cleanups.push(cleanup);
    this.triggerCleanupHandlesByKey.set(key, cleanups);
  }

  private async stopTrigger(trigger: TriggerInstanceId): Promise<void> {
    const key = this.toTriggerKey(trigger);
    const cleanups = this.triggerCleanupHandlesByKey.get(key) ?? [];
    this.triggerCleanupHandlesByKey.delete(key);
    for (const cleanup of [...cleanups].reverse()) {
      await cleanup.stop();
    }
  }

  private toTriggerKey(trigger: TriggerInstanceId): string {
    return `${trigger.workflowId}:${trigger.nodeId}`;
  }

  async createTriggerTestItems(args: { workflow: WorkflowDefinition; nodeId: NodeId }): Promise<Items | undefined> {
    const definition = args.workflow.nodes.find((node) => node.id === args.nodeId);
    if (!definition) {
      throw new Error(`Unknown trigger nodeId: ${args.nodeId}`);
    }
    if (definition.kind !== "trigger") {
      throw new Error(`Node ${args.nodeId} is not a trigger`);
    }
    const node = this.nodeResolver.resolve(definition.type) as TriggerNode;
    if (!this.isTestableTriggerNode(node)) {
      return undefined;
    }
    const data = this.runDataFactory.create();
    const runId = this.runIdFactory.makeRunId();
    const trigger = { workflowId: args.workflow.id, nodeId: definition.id } as const;
    const previousState = await this.triggerSetupStateStore.load(trigger);
    return await node.getTestItems({
      ...this.createExecutionContext({
        runId,
        workflowId: args.workflow.id,
        nodeId: definition.id,
        parent: undefined,
        data,
      }),
      trigger,
      nodeId: definition.id,
      config: definition.config as TriggerNodeConfig,
      previousState: previousState?.state as never,
    });
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
    const base = this.createExecutionContext({
      runId,
      workflowId: wf.id,
      nodeId: startAt,
      parent,
      data,
      nodeState: this.createNodeStatePublisher(runId, wf.id, parent),
    });

    const topology = WorkflowTopology.fromWorkflow(wf);

    const nodeInstances = this.nodeInstanceFactory.createNodes(wf);

    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const startDef = topology.defsById.get(startAt);
    if (!startDef) throw new Error(`Unknown start nodeId: ${startAt}`);

    const batchId = "batch_1";
    let queue: RunQueueEntry[] = [];
    const initialNodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot> = {};

    if (startDef.kind === "trigger") {
      const request = this.createSingleActivationRequest({
        runId,
        workflowId: wf.id,
        definition: startDef,
        parent,
        executionOptions,
        batchId,
        input: items,
        base,
        data,
      });
      return await this.enqueueActivation({
        runId,
        workflowId: wf.id,
        startedAt,
        parent,
        executionOptions,
        workflowSnapshot: persistedStateOverrides?.workflowSnapshot ?? this.workflowSnapshotFactory.create(wf),
        mutableState: persistedStateOverrides?.mutableState,
        control: undefined,
        pendingQueue: [],
        request,
        previousNodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
        planner,
      });
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
      const result: RunResult = { runId, workflowId: wf.id, startedAt, status: "completed", outputs };
      this.resolveRunCompletion(result);
      return result;
    }

    const def = topology.defsById.get(next.nodeId);
    if (!def || def.kind !== "node") throw new Error(`Node ${next.nodeId} is not a runnable node`);

    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: any = {
      ...base,
      data,
      nodeId: def.id,
      activationId,
      config: def.config,
      binary: base.binary.forNode({ nodeId: def.id, activationId }),
      getCredential: this.createCredentialResolver(wf.id, def.id, def.config),
    };
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
    this.notifyPendingStatePersisted(runId);
    await this.publishNodeEvent("nodeQueued", queuedSnapshot);

    return { runId, workflowId: wf.id, startedAt, status: "pending", pending };
  }

  async runWorkflowFromState(request: CurrentStateExecutionRequest): Promise<RunResult> {
    const runId = this.runIdFactory.makeRunId();
    const startedAt = new Date().toISOString();
    const workflowSnapshot = request.workflowSnapshot ?? this.workflowSnapshotFactory.create(request.workflow);
    const mutableState = request.mutableState ?? request.currentState?.mutableState;
    const control = {
      stopCondition: request.stopCondition ?? { kind: "workflowCompleted" as const },
    };

    await this.runStore.createRun({
      runId,
      workflowId: request.workflow.id,
      startedAt,
      parent: request.parent,
      executionOptions: request.executionOptions,
      control,
      workflowSnapshot,
      mutableState,
    });

    const topology = WorkflowTopology.fromWorkflow(request.workflow);
    const nodeInstances = this.nodeInstanceFactory.createNodes(request.workflow);
    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const plan = new CurrentStateFrontierPlanner(topology).plan({
      currentState: this.createRunCurrentState(request.currentState, mutableState),
      stopCondition: control.stopCondition,
      reset: request.reset,
      items: request.items,
    });

    const data = this.runDataFactory.create(plan.currentState.outputsByNode);
    const base = this.createExecutionContext({
      runId,
      workflowId: request.workflow.id,
      nodeId: request.workflow.nodes[0]?.id ?? "unknown_node",
      parent: request.parent,
      data,
      nodeState: this.createNodeStatePublisher(runId, request.workflow.id, request.parent),
    });

    return await this.scheduleInitialPlan({
      runId,
      startedAt,
      workflow: request.workflow,
      workflowSnapshot,
      mutableState,
      executionOptions: request.executionOptions,
      control,
      parent: request.parent,
      planner,
      plan,
      base,
      data,
    });
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

    const nodeInstances = this.nodeInstanceFactory.createNodes(wf);

    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();

    const data = this.runDataFactory.create(state.outputsByNode);
    const base = this.createExecutionContext({
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      parent: state.parent,
      data,
      nodeState: this.createNodeStatePublisher(state.runId, state.workflowId, state.parent),
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

    if (this.isStopConditionSatisfied(state.control?.stopCondition, args.nodeId)) {
      await this.runStore.save({
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        parent: state.parent,
        executionOptions: state.executionOptions,
        control: state.control,
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
      const result: RunResult = {
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        status: "completed",
        outputs: this.resolveResultOutputs(wf, state.control?.stopCondition, data.dump()),
      };
      this.resolveRunCompletion(result);
      return result;
    }

    const batchId = state.pending.batchId ?? "batch_1";
    const queue: RunQueueEntry[] = (state.queue ?? []).map((q) => ({ ...q, batchId: q.batchId ?? batchId }));
    const nextNodeSnapshotsByNodeId = {
      ...(state.nodeSnapshotsByNodeId ?? {}),
      [args.nodeId]: completedSnapshot,
    };

    planner.applyOutputs(queue, { fromNodeId: args.nodeId, outputs: args.outputs as any, batchId });
    this.applyPinnedQueueSkips({
      runId: state.runId,
      workflowId: state.workflowId,
      parent: state.parent,
      mutableState: state.mutableState,
      planner,
      queue,
      data,
      nodeSnapshotsByNodeId: nextNodeSnapshotsByNodeId,
      finishedAt: completedAt,
    });

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
      control: state.control,
        workflowSnapshot: state.workflowSnapshot,
        mutableState: state.mutableState,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: nextNodeSnapshotsByNodeId,
      });
      await this.publishNodeEvent("nodeCompleted", completedSnapshot);

      const result: RunResult = { runId: state.runId, workflowId: state.workflowId, startedAt: state.startedAt, status: "completed", outputs };
      this.resolveRunCompletion(result);
      return result;
    }

    const def = topology.defsById.get(next.nodeId);
    if (!def || def.kind !== "node") throw new Error(`Node ${next.nodeId} is not a runnable node`);

    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: any = {
      ...base,
      data,
      nodeId: def.id,
      activationId,
      config: def.config,
      binary: base.binary.forNode({ nodeId: def.id, activationId }),
      getCredential: this.createCredentialResolver(state.workflowId, def.id, def.config),
    };
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
      control: state.control,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
      status: "pending",
      pending,
      queue: queue.map((q) => ({ ...q })),
      outputsByNode: data.dump(),
      nodeSnapshotsByNodeId: {
        ...nextNodeSnapshotsByNodeId,
        [def.id]: queuedSnapshot,
      },
    });
    this.notifyPendingStatePersisted(state.runId);
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
      control: state.control,
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
      const outputs = wf ? this.resolveResultOutputs(wf, existing.control?.stopCondition, existing.outputsByNode) : [];
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
    const nodeInstances = this.nodeInstanceFactory.createNodes(args.workflow);
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

    if (this.isStopConditionSatisfied(args.state.control?.stopCondition, args.args.nodeId)) {
      await this.runStore.save({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        control: args.state.control,
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
      this.resolveWebhookResponse({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        runStatus: "completed",
        response: args.signal.responseItems,
      });
      const result: RunResult = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        status: "completed",
        outputs: this.resolveResultOutputs(args.workflow, args.state.control?.stopCondition, data.dump()),
      };
      this.resolveRunCompletion(result);
      return result;
    }

    if (args.signal.kind === "respondNow") {
      await this.runStore.save({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        control: args.state.control,
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
        control: args.state.control,
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

    const base = this.createExecutionContext({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      nodeId: nextDefinition.id,
      parent: args.state.parent,
      data,
      nodeState: this.createNodeStatePublisher(args.state.runId, args.state.workflowId, args.state.parent),
    });
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: any = {
      ...base,
      data,
      nodeId: nextDefinition.id,
      activationId,
      config: nextDefinition.config,
      binary: base.binary.forNode({ nodeId: nextDefinition.id, activationId }),
      getCredential: this.createCredentialResolver(args.state.workflowId, nextDefinition.id, nextDefinition.config),
    };
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
      control: args.state.control,
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
    this.notifyPendingStatePersisted(args.state.runId);
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

  private createRunCurrentState(
    currentState: RunCurrentState | undefined,
    mutableState: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"],
  ): RunCurrentState {
    return {
      outputsByNode: { ...(currentState?.outputsByNode ?? {}) },
      nodeSnapshotsByNodeId: { ...(currentState?.nodeSnapshotsByNodeId ?? {}) },
      mutableState: mutableState ?? currentState?.mutableState,
    };
  }

  private async scheduleInitialPlan(args: {
    runId: RunId;
    startedAt: string;
    workflow: WorkflowDefinition;
    workflowSnapshot: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
    mutableState: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    executionOptions?: RunExecutionOptions;
    control: PersistedRunControlState | undefined;
    parent?: ParentExecutionRef;
    planner: RunQueuePlanner;
    plan: ExecutionFrontierPlan;
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
  }): Promise<RunResult> {
    const initialNodeSnapshotsByNodeId = this.applySkippedSnapshots({
      runId: args.runId,
      workflowId: args.workflow.id,
      parent: args.parent,
      currentState: args.plan.currentState,
      skippedNodeIds: args.plan.skippedNodeIds,
      preservedPinnedNodeIds: args.plan.preservedPinnedNodeIds,
      finishedAt: args.startedAt,
    });

    if (args.plan.rootNodeId) {
      const startDef = WorkflowTopology.fromWorkflow(args.workflow).defsById.get(args.plan.rootNodeId);
      if (!startDef) {
        throw new Error(`Unknown frontier nodeId: ${args.plan.rootNodeId}`);
      }
      const startItems = args.plan.rootNodeInput ?? [];
      if (startDef.kind === "trigger") {
        const request = this.createSingleActivationRequest({
          runId: args.runId,
          workflowId: args.workflow.id,
          definition: startDef,
          parent: args.parent,
          executionOptions: args.executionOptions,
          batchId: "batch_1",
          input: startItems,
          base: args.base,
          data: args.data,
        });
        return await this.enqueueActivation({
          runId: args.runId,
          workflowId: args.workflow.id,
          startedAt: args.startedAt,
          parent: args.parent,
          executionOptions: args.executionOptions,
          control: args.control,
          workflowSnapshot: args.workflowSnapshot,
          mutableState: args.mutableState,
          pendingQueue: [],
          request,
          previousNodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
          planner: args.planner,
        });
      }

      const activationId = this.activationIdFactory.makeActivationId();
      const ctx: NodeExecutionContext = {
        ...args.base,
        data: args.data,
        nodeId: startDef.id,
        activationId,
        config: startDef.config,
        binary: args.base.binary.forNode({ nodeId: startDef.id, activationId }),
        getCredential: this.createCredentialResolver(args.workflow.id, startDef.id, startDef.config),
      };
      const request: NodeActivationRequest = {
        kind: "single",
        runId: args.runId,
        activationId,
        workflowId: args.workflow.id,
        nodeId: startDef.id,
        parent: args.parent,
        executionOptions: args.executionOptions,
        batchId: "batch_1",
        input: startItems,
        ctx,
      };
      return await this.enqueueActivation({
        runId: args.runId,
        workflowId: args.workflow.id,
        startedAt: args.startedAt,
        parent: args.parent,
        executionOptions: args.executionOptions,
        control: args.control,
        workflowSnapshot: args.workflowSnapshot,
        mutableState: args.mutableState,
        pendingQueue: [],
        request,
        previousNodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
        planner: args.planner,
      });
    }

    return await this.scheduleQueuedPlan({
      runId: args.runId,
      workflowId: args.workflow.id,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      workflow: args.workflow,
      planner: args.planner,
      queue: [...args.plan.queue],
      base: args.base,
      data: args.data,
      nodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
    });
  }

  private async scheduleQueuedPlan(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    control: PersistedRunControlState | undefined;
    workflowSnapshot: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
    mutableState: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    workflow: WorkflowDefinition;
    planner: RunQueuePlanner;
    queue: RunQueueEntry[];
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
  }): Promise<RunResult> {
    this.applyPinnedQueueSkips({
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      mutableState: args.mutableState,
      planner: args.planner,
      queue: args.queue,
      data: args.data,
      nodeSnapshotsByNodeId: args.nodeSnapshotsByNodeId,
      finishedAt: args.startedAt,
    });
    const next = args.planner.nextActivation(args.queue);
    if (!next) {
      return await this.completeRun({
        runId: args.runId,
        workflowId: args.workflowId,
        startedAt: args.startedAt,
        parent: args.parent,
        executionOptions: args.executionOptions,
        control: args.control,
        workflowSnapshot: args.workflowSnapshot,
        mutableState: args.mutableState,
        workflow: args.workflow,
        data: args.data,
        nodeSnapshotsByNodeId: args.nodeSnapshotsByNodeId,
      });
    }

    const definition = WorkflowTopology.fromWorkflow(args.workflow).defsById.get(next.nodeId);
    if (!definition || definition.kind !== "node") {
      throw new Error(`Node ${next.nodeId} is not a runnable node`);
    }

    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: NodeExecutionContext = {
      ...args.base,
      data: args.data,
      nodeId: definition.id,
      activationId,
      config: definition.config,
      binary: args.base.binary.forNode({ nodeId: definition.id, activationId }),
      getCredential: this.createCredentialResolver(args.workflowId, definition.id, definition.config),
    };
    const request: NodeActivationRequest =
      next.kind === "multi"
        ? {
            kind: "multi",
            runId: args.runId,
            activationId,
            workflowId: args.workflowId,
            nodeId: definition.id,
            parent: args.parent,
            executionOptions: args.executionOptions,
            batchId: next.batchId,
            inputsByPort: next.inputsByPort,
            ctx,
          }
        : {
            kind: "single",
            runId: args.runId,
            activationId,
            workflowId: args.workflowId,
            nodeId: definition.id,
            parent: args.parent,
            executionOptions: args.executionOptions,
            batchId: next.batchId,
            input: next.input,
            ctx,
          };

    return await this.enqueueActivation({
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      pendingQueue: args.queue,
      request,
      previousNodeSnapshotsByNodeId: args.nodeSnapshotsByNodeId,
      planner: args.planner,
    });
  }

  private async enqueueActivation(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    control: PersistedRunControlState | undefined;
    workflowSnapshot: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
    mutableState: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    pendingQueue: RunQueueEntry[];
    request: NodeActivationRequest;
    previousNodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
    planner: RunQueuePlanner;
  }): Promise<RunResult> {
    const receipt = await this.activationScheduler.enqueue(args.request);
    const inputsByPort = InputPortMap.fromRequest(args.request);
    const itemsIn = args.request.kind === "multi" ? args.planner.sumItemsByPort(args.request.inputsByPort) : args.request.input.length;
    const enqueuedAt = new Date().toISOString();
    const pending: PendingNodeExecution = {
      runId: args.runId,
      activationId: args.request.activationId,
      workflowId: args.workflowId,
      nodeId: args.request.nodeId,
      itemsIn,
      inputsByPort,
      receiptId: receipt.receiptId,
      queue: receipt.queue,
      batchId: args.request.batchId,
      enqueuedAt,
    };
    const queuedSnapshot = NodeSnapshotFactory.queued({
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.request.nodeId,
      activationId: args.request.activationId,
      parent: args.parent,
      queuedAt: enqueuedAt,
      inputsByPort,
    });

    await this.runStore.save({
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      status: "pending",
      pending,
      queue: args.pendingQueue.map((entry) => ({ ...entry })),
      outputsByNode: (args.request.ctx.data as ReturnType<RunDataFactory["create"]>).dump(),
      nodeSnapshotsByNodeId: {
        ...args.previousNodeSnapshotsByNodeId,
        [args.request.nodeId]: queuedSnapshot,
      },
    });
    this.notifyPendingStatePersisted(args.runId);
    await this.publishNodeEvent("nodeQueued", queuedSnapshot);
    return { runId: args.runId, workflowId: args.workflowId, startedAt: args.startedAt, status: "pending", pending };
  }

  private createSingleActivationRequest(args: {
    runId: RunId;
    workflowId: WorkflowId;
    definition: Readonly<{ id: NodeId; config: NodeExecutionContext["config"] }>;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    batchId: string;
    input: Items;
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
  }): NodeActivationRequest {
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: NodeExecutionContext = {
      ...args.base,
      data: args.data,
      nodeId: args.definition.id,
      activationId,
      config: args.definition.config,
      binary: args.base.binary.forNode({ nodeId: args.definition.id, activationId }),
      getCredential: this.createCredentialResolver(args.workflowId, args.definition.id, args.definition.config),
    };
    return {
      kind: "single",
      runId: args.runId,
      activationId,
      workflowId: args.workflowId,
      nodeId: args.definition.id,
      parent: args.parent,
      executionOptions: args.executionOptions,
      batchId: args.batchId,
      input: args.input,
      ctx,
    };
  }

  private createExecutionContext(args: {
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    parent?: ParentExecutionRef;
    data: ReturnType<RunDataFactory["create"]>;
    nodeState?: NodeExecutionStatePublisher;
  }) {
    return this.executionContextFactory.create({
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      data: args.data,
      nodeState: args.nodeState,
      getCredential: this.createCredentialResolver(args.workflowId, args.nodeId),
    });
  }

  private createCredentialResolver(
    workflowId: WorkflowId,
    nodeId: NodeId,
    config?: NodeExecutionContext["config"],
  ): NodeExecutionContext["getCredential"] {
    const acceptedTypesBySlot = new Map<string, ReadonlyArray<string>>();
    for (const requirement of config?.getCredentialRequirements?.() ?? []) {
      acceptedTypesBySlot.set(requirement.slotKey, requirement.acceptedTypes);
    }
    return async <TSession = unknown>(slotKey: string): Promise<TSession> => {
      try {
        return await this.credentialSessions.getSession<TSession>({
          workflowId,
          nodeId,
          slotKey,
        });
      } catch (error) {
        const acceptedTypes = acceptedTypesBySlot.get(slotKey) ?? [];
        const message = error instanceof Error ? error.message : String(error);
        const acceptedTypesSuffix = acceptedTypes.length > 0 ? ` Accepted types: ${acceptedTypes.join(", ")}.` : "";
        throw new Error(
          `Failed to resolve credential for workflow ${workflowId} node ${nodeId} slot "${slotKey}". ${message}${acceptedTypesSuffix}`,
          { cause: error },
        );
      }
    };
  }

  private notifyPendingStatePersisted(runId: RunId): void {
    this.activationScheduler.notifyPendingStatePersisted?.(runId);
  }

  private async completeRun(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    control: PersistedRunControlState | undefined;
    workflowSnapshot: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
    mutableState: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    workflow: WorkflowDefinition;
    data: ReturnType<RunDataFactory["create"]>;
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
  }): Promise<RunResult> {
    await this.runStore.save({
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      status: "completed",
      pending: undefined,
      queue: [],
      outputsByNode: args.data.dump(),
      nodeSnapshotsByNodeId: args.nodeSnapshotsByNodeId,
    });
    const result: RunResult = {
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      status: "completed",
      outputs: this.resolveResultOutputs(args.workflow, args.control?.stopCondition, args.data.dump()),
    };
    this.resolveRunCompletion(result);
    return result;
  }

  private resolveResultOutputs(
    workflow: WorkflowDefinition,
    stopCondition: PersistedRunControlState["stopCondition"],
    outputsByNode: Record<NodeId, NodeOutputs>,
  ): Items {
    if (stopCondition?.kind === "nodeCompleted") {
      return outputsByNode[stopCondition.nodeId]?.main ?? [];
    }
    const lastNodeId =
      workflow.nodes.at(-1)?.id ??
      (() => {
        throw new Error(`Workflow ${workflow.id} has no nodes`);
      })();
    return outputsByNode[lastNodeId]?.main ?? [];
  }

  private applySkippedSnapshots(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    currentState: RunCurrentState;
    skippedNodeIds: ReadonlyArray<NodeId>;
    preservedPinnedNodeIds: ReadonlyArray<NodeId>;
    finishedAt: string;
  }): Record<NodeId, NodeExecutionSnapshot> {
    const snapshots = { ...args.currentState.nodeSnapshotsByNodeId };
    const skippedPinnedNodeIds = new Set<NodeId>(args.preservedPinnedNodeIds.filter((nodeId) => args.skippedNodeIds.includes(nodeId)));
    for (const nodeId of args.skippedNodeIds) {
      if (args.currentState.mutableState?.nodesById?.[nodeId]?.pinnedOutputsByPort) {
        skippedPinnedNodeIds.add(nodeId);
      }
    }
    for (const nodeId of skippedPinnedNodeIds) {
      const previous = snapshots[nodeId];
      snapshots[nodeId] = NodeSnapshotFactory.completedFromPinnedOutput({
        previous,
        runId: args.runId,
        workflowId: args.workflowId,
        nodeId,
        activationId: previous?.activationId ?? `synthetic_${nodeId}`,
        parent: args.parent,
        finishedAt: args.finishedAt,
        inputsByPort: previous?.inputsByPort ?? InputPortMap.empty(),
        outputs: args.currentState.outputsByNode[nodeId] ?? {},
      });
    }
    return snapshots;
  }

  private applyPinnedQueueSkips(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    mutableState: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    planner: RunQueuePlanner;
    queue: RunQueueEntry[];
    data: ReturnType<RunDataFactory["create"]>;
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
    finishedAt: string;
  }): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < args.queue.length; index += 1) {
        const queueEntry = args.queue[index]!;
        const pinnedOutputs = args.mutableState?.nodesById?.[queueEntry.nodeId]?.pinnedOutputsByPort;
        if (!pinnedOutputs) {
          continue;
        }
        args.queue.splice(index, 1);
        const previous = args.nodeSnapshotsByNodeId[queueEntry.nodeId];
        args.nodeSnapshotsByNodeId[queueEntry.nodeId] = NodeSnapshotFactory.completedFromPinnedOutput({
          previous,
          runId: args.runId,
          workflowId: args.workflowId,
          nodeId: queueEntry.nodeId,
          activationId: previous?.activationId ?? `synthetic_${queueEntry.nodeId}`,
          parent: args.parent,
          finishedAt: args.finishedAt,
          inputsByPort: this.resolveQueueEntryInputsByPort(queueEntry),
          outputs: pinnedOutputs,
        });
        args.data.setOutputs(queueEntry.nodeId, pinnedOutputs);
        args.planner.applyOutputs(args.queue, {
          fromNodeId: queueEntry.nodeId,
          outputs: pinnedOutputs as any,
          batchId: queueEntry.batchId ?? "batch_1",
        });
        changed = true;
        break;
      }
    }
  }

  private resolveQueueEntryInputsByPort(queueEntry: RunQueueEntry): NodeInputsByPort {
    if (queueEntry.collect) {
      return queueEntry.collect.received;
    }
    return {
      [queueEntry.toInput ?? "in"]: queueEntry.input,
    };
  }

  private isStopConditionSatisfied(
    stopCondition: PersistedRunControlState["stopCondition"],
    nodeId: NodeId,
  ): boolean {
    if (!stopCondition || stopCondition.kind === "workflowCompleted") {
      return false;
    }
    return stopCondition.nodeId === nodeId;
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

  private createNodeStatePublisher(runId: RunId, workflowId: WorkflowId, parent: ParentExecutionRef | undefined) {
    return new BoundNodeExecutionStatePublisher(this.runStore, runId, workflowId, parent, async (kind, snapshot) => {
      await this.publishNodeEvent(kind, snapshot);
    });
  }

  private isTestableTriggerNode(node: TriggerNode): node is TestableTriggerNode<TriggerNodeConfig> {
    return typeof (node as Partial<TestableTriggerNode<TriggerNodeConfig>>).getTestItems === "function";
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

export { EngineWorkflowRunnerService } from "./EngineWorkflowRunnerService";

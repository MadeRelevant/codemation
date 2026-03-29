import type {
  CurrentStateExecutionRequest,
  ExecutionContextFactory,
  ExecutionFrontierPlan,
  Items,
  NodeExecutionSnapshot,
  NodeId,
  NodeOutputs,
  ParentExecutionRef,
  PersistedRunControlState,
  RunCurrentState,
  RunDataFactory,
  RunExecutionOptions,
  RunId,
  RunIdFactory,
  RunQueueEntry,
  RunResult,
  WorkflowExecutionRepository,
  WorkflowDefinition,
  WorkflowId,
  WorkflowPolicyRuntimeDefaults,
  WorkflowSnapshotFactory,
} from "../types";

import { WorkflowExecutableNodeClassifierFactory } from "../workflow/definition/WorkflowExecutableNodeClassifierFactory";
import { CurrentStateFrontierPlanner } from "../planning/CurrentStateFrontierPlanner";
import { RunQueuePlanner } from "../planning/RunQueuePlanner";
import { WorkflowTopology } from "../planning/WorkflowTopologyPlanner";
import { EngineExecutionLimitsPolicy } from "../policies/executionLimits/EngineExecutionLimitsPolicy";
import { EngineWorkflowPlanningFactory } from "../planning/EngineWorkflowPlanningFactory";
import type { EngineWaiters } from "../orchestration/EngineWaiters";
import { RunPolicySnapshotFactory } from "../policies/storage/RunPolicySnapshotFactory";

import { ActivationEnqueueService } from "../execution/ActivationEnqueueService";
import { NodeRunStateWriterFactory } from "../execution/NodeRunStateWriterFactory";
import { NodeActivationRequestComposer } from "../execution/NodeActivationRequestComposer";
import { RunStateSemantics } from "../execution/RunStateSemantics";
import { WorkflowRunExecutionContextFactory } from "../execution/WorkflowRunExecutionContextFactory";

export class RunStartService {
  constructor(
    private readonly runIdFactory: RunIdFactory,
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly runDataFactory: RunDataFactory,
    private readonly workflowSnapshotFactory: WorkflowSnapshotFactory,
    private readonly planningFactory: EngineWorkflowPlanningFactory,
    private readonly nodeStatePublisherFactory: NodeRunStateWriterFactory,
    private readonly runExecutionContextFactory: WorkflowRunExecutionContextFactory,
    private readonly nodeActivationRequestComposer: NodeActivationRequestComposer,
    private readonly activationEnqueueService: ActivationEnqueueService,
    private readonly semantics: RunStateSemantics,
    private readonly waiters: EngineWaiters,
    private readonly workflowPolicyRuntimeDefaults: WorkflowPolicyRuntimeDefaults | undefined,
    private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy,
  ) {}

  async runWorkflow(
    workflow: WorkflowDefinition,
    startAt: NodeId,
    items: Items,
    parent?: ParentExecutionRef,
    executionOptions?: RunExecutionOptions,
    persistedStateOverrides?: Readonly<{
      workflowSnapshot?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
      mutableState?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"];
    }>,
  ): Promise<RunResult> {
    const runId = this.runIdFactory.makeRunId();
    const startedAt = new Date().toISOString();
    const workflowSnapshot = persistedStateOverrides?.workflowSnapshot ?? this.workflowSnapshotFactory.create(workflow);
    const mutableState = persistedStateOverrides?.mutableState;
    const policySnapshot = RunPolicySnapshotFactory.create(workflow, this.workflowPolicyRuntimeDefaults);
    const mergedExecutionOptions = this.executionLimitsPolicy.mergeExecutionOptionsForNewRun(parent, executionOptions);

    await this.workflowExecutionRepository.createRun({
      runId,
      workflowId: workflow.id,
      startedAt,
      parent,
      executionOptions: mergedExecutionOptions,
      workflowSnapshot,
      mutableState,
      policySnapshot,
      engineCounters: { completedNodeActivations: 0 },
    });

    const data = this.runDataFactory.create();
    const base = this.runExecutionContextFactory.create({
      runId,
      workflowId: workflow.id,
      nodeId: startAt,
      parent,
      subworkflowDepth: mergedExecutionOptions.subworkflowDepth ?? 0,
      engineMaxNodeActivations: mergedExecutionOptions.maxNodeActivations!,
      engineMaxSubworkflowDepth: mergedExecutionOptions.maxSubworkflowDepth!,
      data,
      nodeState: this.nodeStatePublisherFactory.create(runId, workflow.id, parent),
    });
    const { topology, planner } = this.planningFactory.create(workflow);
    const startDefinition = topology.defsById.get(startAt);
    if (!startDefinition) {
      throw new Error(`Unknown start nodeId: ${startAt}`);
    }

    const initialNodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot> = {};
    if (startDefinition.kind === "trigger") {
      const request = this.nodeActivationRequestComposer.createSingleFromDefinition({
        runId,
        workflowId: workflow.id,
        definition: startDefinition,
        parent,
        executionOptions: mergedExecutionOptions,
        batchId: "batch_1",
        input: items,
        base,
        data,
      });
      return await this.activationEnqueueService.enqueueActivation({
        runId,
        workflowId: workflow.id,
        startedAt,
        parent,
        executionOptions: mergedExecutionOptions,
        workflowSnapshot,
        mutableState,
        policySnapshot,
        control: undefined,
        pendingQueue: [],
        request,
        previousNodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
        planner,
        engineCounters: { completedNodeActivations: 0 },
        connectionInvocations: [],
      });
    }

    const queue: RunQueueEntry[] = [{ nodeId: startAt, input: items, toInput: "in", batchId: "batch_1" }];
    return await this.scheduleQueuedPlan({
      runId,
      workflowId: workflow.id,
      startedAt,
      parent,
      executionOptions: mergedExecutionOptions,
      control: undefined,
      workflowSnapshot,
      mutableState,
      policySnapshot,
      workflow,
      planner,
      queue,
      base,
      data,
      nodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
      connectionInvocations: [],
    });
  }

  async runWorkflowFromState(request: CurrentStateExecutionRequest): Promise<RunResult> {
    const runId = this.runIdFactory.makeRunId();
    const startedAt = new Date().toISOString();
    const workflowSnapshot = request.workflowSnapshot ?? this.workflowSnapshotFactory.create(request.workflow);
    const mutableState = request.mutableState ?? request.currentState?.mutableState;
    const policySnapshot = RunPolicySnapshotFactory.create(request.workflow, this.workflowPolicyRuntimeDefaults);
    const control = {
      stopCondition: request.stopCondition ?? { kind: "workflowCompleted" as const },
    };
    const mergedExecutionOptions = this.executionLimitsPolicy.mergeExecutionOptionsForNewRun(
      request.parent,
      request.executionOptions,
    );

    await this.workflowExecutionRepository.createRun({
      runId,
      workflowId: request.workflow.id,
      startedAt,
      parent: request.parent,
      executionOptions: mergedExecutionOptions,
      control,
      workflowSnapshot,
      mutableState,
      policySnapshot,
      engineCounters: { completedNodeActivations: 0 },
    });

    const { topology, planner } = this.planningFactory.create(request.workflow);
    const plan = CurrentStateFrontierPlanner.createFromTopology(topology).plan({
      currentState: this.createRunCurrentState(request.currentState, mutableState),
      stopCondition: control.stopCondition,
      reset: request.reset,
      items: request.items,
    });

    const data = this.runDataFactory.create(plan.currentState.outputsByNode);
    const base = this.runExecutionContextFactory.create({
      runId,
      workflowId: request.workflow.id,
      nodeId:
        WorkflowExecutableNodeClassifierFactory.create(request.workflow).firstExecutableNodeIdInDefinitionOrder(
          request.workflow,
        ) ?? "unknown_node",
      parent: request.parent,
      subworkflowDepth: mergedExecutionOptions.subworkflowDepth ?? 0,
      engineMaxNodeActivations: mergedExecutionOptions.maxNodeActivations!,
      engineMaxSubworkflowDepth: mergedExecutionOptions.maxSubworkflowDepth!,
      data,
      nodeState: this.nodeStatePublisherFactory.create(runId, request.workflow.id, request.parent),
    });

    return await this.scheduleInitialPlan({
      runId,
      startedAt,
      workflow: request.workflow,
      workflowSnapshot,
      mutableState,
      policySnapshot,
      executionOptions: mergedExecutionOptions,
      control,
      parent: request.parent,
      planner,
      plan,
      base,
      data,
    });
  }

  private createRunCurrentState(
    currentState: RunCurrentState | undefined,
    mutableState: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"],
  ): RunCurrentState {
    return {
      outputsByNode: { ...(currentState?.outputsByNode ?? {}) },
      nodeSnapshotsByNodeId: { ...(currentState?.nodeSnapshotsByNodeId ?? {}) },
      connectionInvocations: currentState?.connectionInvocations ? [...currentState.connectionInvocations] : undefined,
      mutableState: mutableState ?? currentState?.mutableState,
    };
  }

  private async scheduleInitialPlan(args: {
    runId: RunId;
    startedAt: string;
    workflow: WorkflowDefinition;
    workflowSnapshot: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
    mutableState: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"];
    policySnapshot: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["policySnapshot"];
    executionOptions?: RunExecutionOptions;
    control: PersistedRunControlState | undefined;
    parent?: ParentExecutionRef;
    planner: RunQueuePlanner;
    plan: ExecutionFrontierPlan;
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
  }): Promise<RunResult> {
    const initialNodeSnapshotsByNodeId = this.semantics.applySkippedSnapshots({
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
      const request = this.nodeActivationRequestComposer.createSingleFromDefinition({
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
      return await this.activationEnqueueService.enqueueActivation({
        runId: args.runId,
        workflowId: args.workflow.id,
        startedAt: args.startedAt,
        parent: args.parent,
        executionOptions: args.executionOptions,
        control: args.control,
        workflowSnapshot: args.workflowSnapshot,
        mutableState: args.mutableState,
        policySnapshot: args.policySnapshot,
        pendingQueue: [],
        request,
        previousNodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
        planner: args.planner,
        engineCounters: { completedNodeActivations: 0 },
        connectionInvocations: args.plan.currentState.connectionInvocations ?? [],
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
      policySnapshot: args.policySnapshot,
      workflow: args.workflow,
      planner: args.planner,
      queue: [...args.plan.queue],
      base: args.base,
      data: args.data,
      nodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
      connectionInvocations: args.plan.currentState.connectionInvocations ?? [],
    });
  }

  private async scheduleQueuedPlan(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    control: PersistedRunControlState | undefined;
    workflowSnapshot: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
    mutableState: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"];
    policySnapshot: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["policySnapshot"];
    workflow: WorkflowDefinition;
    planner: RunQueuePlanner;
    queue: RunQueueEntry[];
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
    connectionInvocations: RunCurrentState["connectionInvocations"];
  }): Promise<RunResult> {
    this.semantics.applyPinnedQueueSkips({
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
        policySnapshot: args.policySnapshot,
        workflow: args.workflow,
        data: args.data,
        nodeSnapshotsByNodeId: args.nodeSnapshotsByNodeId,
        connectionInvocations: args.connectionInvocations,
      });
    }

    const definition = WorkflowTopology.fromWorkflow(args.workflow).defsById.get(next.nodeId);
    if (!definition || definition.kind !== "node") {
      throw new Error(`Node ${next.nodeId} is not a runnable node`);
    }

    const request = this.nodeActivationRequestComposer.createFromPlannedActivation({
      next,
      base: args.base,
      data: args.data,
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      executionOptions: args.executionOptions,
      nodeDefinition: definition,
    });

    return await this.activationEnqueueService.enqueueActivation({
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      policySnapshot: args.policySnapshot,
      pendingQueue: args.queue,
      request,
      previousNodeSnapshotsByNodeId: args.nodeSnapshotsByNodeId,
      planner: args.planner,
      engineCounters: { completedNodeActivations: 0 },
      connectionInvocations: args.connectionInvocations ?? [],
    });
  }

  private async completeRun(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    control: PersistedRunControlState | undefined;
    workflowSnapshot: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
    mutableState: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"];
    policySnapshot: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["policySnapshot"];
    workflow: WorkflowDefinition;
    data: ReturnType<RunDataFactory["create"]>;
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
    connectionInvocations: RunCurrentState["connectionInvocations"];
  }): Promise<RunResult> {
    await this.workflowExecutionRepository.save({
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      policySnapshot: args.policySnapshot,
      engineCounters: { completedNodeActivations: 0 },
      connectionInvocations: args.connectionInvocations ? [...args.connectionInvocations] : [],
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
      outputs: this.semantics.resolveResultOutputs(
        args.workflow,
        args.control?.stopCondition,
        args.data.dump() as Record<NodeId, NodeOutputs>,
      ),
    };
    this.waiters.resolveRunCompletion(result);
    return result;
  }
}

import type {
  CurrentStateExecutionRequest,
  ExecutionContextFactory,
  ExecutionFrontierPlan,
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
  RunStateStore,
  WorkflowDefinition,
  WorkflowId,
  WorkflowPolicyRuntimeDefaults,
  WorkflowSnapshotFactory,
} from "../../../types";

import { RunQueuePlanner } from "../../domain/planning/runQueuePlanner";
import { WorkflowTopology } from "../../domain/planning/WorkflowTopologyPlanner";
import { CurrentStateFrontierPlannerFactory } from "../planning/CurrentStateFrontierPlannerFactory";

import { EngineExecutionLimitsPolicy } from "../policies/EngineExecutionLimitsPolicy";
import { EngineWorkflowPlanningFactory } from "../planning/EngineWorkflowPlanningFactory";
import type { EngineWaiters } from "../waiters/EngineWaiters";
import { NodeExecutionStatePublisherFactory } from "../state/NodeExecutionStatePublisherFactory";

import { ActivationEnqueueService } from "./ActivationEnqueueService";
import { NodeActivationRequestComposer } from "./NodeActivationRequestComposer";
import { RunStateSemantics } from "./RunStateSemantics";
import { RunPolicySnapshotFactory } from "../policies/RunPolicySnapshotFactory";
import { WorkflowRunExecutionContextFactory } from "./WorkflowRunExecutionContextFactory";

export class CurrentStateRunStarter {
  constructor(
    private readonly runIdFactory: RunIdFactory,
    private readonly runStore: RunStateStore,
    private readonly runDataFactory: RunDataFactory,
    private readonly workflowSnapshotFactory: WorkflowSnapshotFactory,
    private readonly planningFactory: EngineWorkflowPlanningFactory,
    private readonly currentStateFrontierPlannerFactory: CurrentStateFrontierPlannerFactory,
    private readonly nodeStatePublisherFactory: NodeExecutionStatePublisherFactory,
    private readonly runExecutionContextFactory: WorkflowRunExecutionContextFactory,
    private readonly nodeActivationRequestComposer: NodeActivationRequestComposer,
    private readonly activationEnqueueService: ActivationEnqueueService,
    private readonly semantics: RunStateSemantics,
    private readonly waiters: EngineWaiters,
    private readonly runPolicySnapshotFactory: RunPolicySnapshotFactory,
    private readonly workflowPolicyRuntimeDefaults: WorkflowPolicyRuntimeDefaults | undefined,
    private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy,
  ) {}

  async runWorkflowFromState(request: CurrentStateExecutionRequest): Promise<RunResult> {
    const runId = this.runIdFactory.makeRunId();
    const startedAt = new Date().toISOString();
    const workflowSnapshot = request.workflowSnapshot ?? this.workflowSnapshotFactory.create(request.workflow);
    const mutableState = request.mutableState ?? request.currentState?.mutableState;
    const policySnapshot = this.runPolicySnapshotFactory.create(request.workflow, this.workflowPolicyRuntimeDefaults);
    const control = {
      stopCondition: request.stopCondition ?? { kind: "workflowCompleted" as const },
    };
    const mergedExecutionOptions = this.executionLimitsPolicy.mergeExecutionOptionsForNewRun(request.parent, request.executionOptions);

    await this.runStore.createRun({
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

    const plan = this.currentStateFrontierPlannerFactory.create(topology).plan({
      currentState: this.createRunCurrentState(request.currentState, mutableState),
      stopCondition: control.stopCondition,
      reset: request.reset,
      items: request.items,
    });

    const data = this.runDataFactory.create(plan.currentState.outputsByNode);
    const base = this.runExecutionContextFactory.create({
      runId,
      workflowId: request.workflow.id,
      nodeId: request.workflow.nodes[0]?.id ?? "unknown_node",
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
    policySnapshot: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["policySnapshot"];
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
      if (startDef.kind === "trigger") {
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
        });
      }

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
    policySnapshot: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["policySnapshot"];
    workflow: WorkflowDefinition;
    planner: RunQueuePlanner;
    queue: RunQueueEntry[];
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
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
    });
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
    policySnapshot: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["policySnapshot"];
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
      policySnapshot: args.policySnapshot,
      engineCounters: { completedNodeActivations: 0 },
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
      outputs: this.semantics.resolveResultOutputs(args.workflow, args.control?.stopCondition, args.data.dump() as Record<NodeId, NodeOutputs>),
    };
    this.waiters.resolveRunCompletion(result);
    return result;
  }
}


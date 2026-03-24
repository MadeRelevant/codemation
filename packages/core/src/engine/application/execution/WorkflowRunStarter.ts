import type {
  Items,
  NodeExecutionSnapshot,
  NodeId,
  ParentExecutionRef,
  RunDataFactory,
  RunExecutionOptions,
  RunIdFactory,
  RunQueueEntry,
  RunResult,
  RunStateStore,
  WorkflowDefinition,
  WorkflowPolicyRuntimeDefaults,
  WorkflowSnapshotFactory,
} from "../../../types";

import { createWorkflowExecutableNodeClassifier } from "../../../workflow/workflowExecutableNodeClassifier.types";
import { EngineExecutionLimitsPolicy } from "../policies/EngineExecutionLimitsPolicy";
import { RunPolicySnapshotFactory } from "../policies/RunPolicySnapshotFactory";
import { EngineWorkflowPlanningFactory } from "../planning/EngineWorkflowPlanningFactory";
import type { EngineWaiters } from "../waiters/EngineWaiters";
import { NodeExecutionStatePublisherFactory } from "../state/NodeExecutionStatePublisherFactory";

import { ActivationEnqueueService } from "./ActivationEnqueueService";
import { NodeActivationRequestComposer } from "./NodeActivationRequestComposer";
import { WorkflowRunExecutionContextFactory } from "./WorkflowRunExecutionContextFactory";

export class WorkflowRunStarter {
  constructor(
    private readonly runIdFactory: RunIdFactory,
    private readonly runStore: RunStateStore,
    private readonly runDataFactory: RunDataFactory,
    private readonly workflowSnapshotFactory: WorkflowSnapshotFactory,
    private readonly planningFactory: EngineWorkflowPlanningFactory,
    private readonly nodeStatePublisherFactory: NodeExecutionStatePublisherFactory,
    private readonly runExecutionContextFactory: WorkflowRunExecutionContextFactory,
    private readonly nodeActivationRequestComposer: NodeActivationRequestComposer,
    private readonly activationEnqueueService: ActivationEnqueueService,
    private readonly waiters: EngineWaiters,
    private readonly runPolicySnapshotFactory: RunPolicySnapshotFactory,
    private readonly workflowPolicyRuntimeDefaults: WorkflowPolicyRuntimeDefaults | undefined,
    private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy,
  ) {}

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
    const workflowSnapshot = persistedStateOverrides?.workflowSnapshot ?? this.workflowSnapshotFactory.create(wf);
    const mutableState = persistedStateOverrides?.mutableState;
    const policySnapshot = this.runPolicySnapshotFactory.create(wf, this.workflowPolicyRuntimeDefaults);
    const mergedExecutionOptions = this.executionLimitsPolicy.mergeExecutionOptionsForNewRun(parent, executionOptions);

    await this.runStore.createRun({
      runId,
      workflowId: wf.id,
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
      workflowId: wf.id,
      nodeId: startAt,
      parent,
      subworkflowDepth: mergedExecutionOptions.subworkflowDepth ?? 0,
      engineMaxNodeActivations: mergedExecutionOptions.maxNodeActivations!,
      engineMaxSubworkflowDepth: mergedExecutionOptions.maxSubworkflowDepth!,
      data,
      nodeState: this.nodeStatePublisherFactory.create(runId, wf.id, parent),
    });

    const { topology, planner } = this.planningFactory.create(wf);

    const startDef = topology.defsById.get(startAt);
    if (!startDef) throw new Error(`Unknown start nodeId: ${startAt}`);

    const batchId = "batch_1";
    const queue: RunQueueEntry[] = [];
    const initialNodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot> = {};

    if (startDef.kind === "trigger") {
      const request = this.nodeActivationRequestComposer.createSingleFromDefinition({
        runId,
        workflowId: wf.id,
        definition: startDef,
        parent,
        executionOptions: mergedExecutionOptions,
        batchId,
        input: items,
        base,
        data,
      });
      return await this.activationEnqueueService.enqueueActivation({
        runId,
        workflowId: wf.id,
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

    queue.push({ nodeId: startAt, input: items, toInput: "in", batchId });

    const next = planner.nextActivation(queue);
    if (!next) {
      const lastNodeId = createWorkflowExecutableNodeClassifier(wf).lastExecutableNodeIdInDefinitionOrder(wf);
      const outputs = data.getOutputItems(lastNodeId, "main");
      await this.runStore.save({
        runId,
        workflowId: wf.id,
        startedAt,
        parent,
        executionOptions: mergedExecutionOptions,
        workflowSnapshot,
        mutableState,
        policySnapshot,
        engineCounters: { completedNodeActivations: 0 },
        connectionInvocations: [],
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
      });
      const result: RunResult = { runId, workflowId: wf.id, startedAt, status: "completed", outputs };
      this.waiters.resolveRunCompletion(result);
      return result;
    }

    const def = topology.defsById.get(next.nodeId);
    if (!def || def.kind !== "node") throw new Error(`Node ${next.nodeId} is not a runnable node`);

    const request = this.nodeActivationRequestComposer.createFromPlannedActivation({
      next,
      base,
      data,
      runId,
      workflowId: wf.id,
      parent,
      executionOptions: mergedExecutionOptions,
      nodeDefinition: def,
    });

    return await this.activationEnqueueService.enqueueActivation({
      runId,
      workflowId: wf.id,
      startedAt,
      parent,
      executionOptions: mergedExecutionOptions,
      control: undefined,
      workflowSnapshot,
      mutableState,
      policySnapshot,
      pendingQueue: queue,
      request,
      previousNodeSnapshotsByNodeId: initialNodeSnapshotsByNodeId,
      planner,
      engineCounters: { completedNodeActivations: 0 },
      connectionInvocations: [],
    });
  }
}

import type {
  ActivationIdFactory,
  ExecutionContextFactory,
  Items,
  NodeActivationRequest,
  NodeExecutionContext,
  NodeExecutionSnapshot,
  NodeId,
  ParentExecutionRef,
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

import { CredentialResolverFactory } from "../credentials/CredentialResolverFactory";
import { EngineExecutionLimitsPolicy } from "../policies/EngineExecutionLimitsPolicy";
import { RunPolicySnapshotFactory } from "../policies/RunPolicySnapshotFactory";
import { EngineWorkflowPlanningFactory } from "../planning/EngineWorkflowPlanningFactory";
import type { EngineWaiters } from "../waiters/EngineWaiters";
import { NodeExecutionStatePublisherFactory } from "../state/NodeExecutionStatePublisherFactory";

import { ActivationEnqueueService } from "./ActivationEnqueueService";

export class WorkflowRunStarter {
  constructor(
    private readonly runIdFactory: RunIdFactory,
    private readonly activationIdFactory: ActivationIdFactory,
    private readonly runStore: RunStateStore,
    private readonly runDataFactory: RunDataFactory,
    private readonly executionContextFactory: ExecutionContextFactory,
    private readonly workflowSnapshotFactory: WorkflowSnapshotFactory,
    private readonly planningFactory: EngineWorkflowPlanningFactory,
    private readonly nodeStatePublisherFactory: NodeExecutionStatePublisherFactory,
    private readonly credentialResolverFactory: CredentialResolverFactory,
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
    const base = this.createExecutionContext({
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
      const request = this.createSingleActivationRequest({
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
      });
    }

    queue.push({ nodeId: startAt, input: items, toInput: "in", batchId });

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
        executionOptions: mergedExecutionOptions,
        workflowSnapshot,
        mutableState,
        policySnapshot,
        engineCounters: { completedNodeActivations: 0 },
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

    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: NodeExecutionContext = {
      ...base,
      data,
      nodeId: def.id,
      activationId,
      config: def.config,
      binary: base.binary.forNode({ nodeId: def.id, activationId }),
      getCredential: this.credentialResolverFactory.create(wf.id, def.id, def.config),
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
            executionOptions: mergedExecutionOptions,
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
            executionOptions: mergedExecutionOptions,
            batchId: next.batchId,
            input: next.input,
            ctx,
          };

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
    });
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
      getCredential: this.credentialResolverFactory.create(args.workflowId, args.definition.id, args.definition.config),
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
    subworkflowDepth: number;
    engineMaxNodeActivations: number;
    engineMaxSubworkflowDepth: number;
    data: ReturnType<RunDataFactory["create"]>;
    nodeState: ReturnType<NodeExecutionStatePublisherFactory["create"]>;
  }) {
    return this.executionContextFactory.create({
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      subworkflowDepth: args.subworkflowDepth,
      engineMaxNodeActivations: args.engineMaxNodeActivations,
      engineMaxSubworkflowDepth: args.engineMaxSubworkflowDepth,
      data: args.data,
      nodeState: args.nodeState,
      getCredential: this.credentialResolverFactory.create(args.workflowId, args.nodeId),
    });
  }
}


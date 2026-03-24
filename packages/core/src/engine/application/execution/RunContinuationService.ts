import type {
  ActivationIdFactory,
  ExecutionContextFactory,
  NodeActivationId,
  NodeActivationRequest,
  NodeExecutionContext,
  NodeExecutionStatePublisher,
  NodeId,
  NodeInputsByPort,
  NodeOutputs,
  ParentExecutionRef,
  PersistedRunState,
  RunDataFactory,
  RunId,
  RunQueueEntry,
  RunResult,
  RunStateStore,
  WebhookControlSignal,
  WebhookRunResult,
  WorkflowDefinition,
  WorkflowId,
  WorkflowSnapshotResolver,
} from "../../../types";

import { WorkflowTopology } from "../../domain/planning/WorkflowTopologyPlanner";

import { CredentialResolverFactory } from "../credentials/CredentialResolverFactory";
import type { RootExecutionOptionsFactory } from "../policies/RootExecutionOptionsFactory";
import { RunTerminalPersistenceCoordinator } from "../policies/RunTerminalPersistenceCoordinator";
import { WorkflowPolicyErrorServices } from "../policies/WorkflowPolicyErrorServices";
import { EngineWorkflowPlanningFactory } from "../planning/EngineWorkflowPlanningFactory";
import type { EngineWaiters } from "../waiters/EngineWaiters";
import { InputPortMap } from "../../domain/execution/InputPortMapFactory";
import { NodeEventPublisher } from "../events/NodeEventPublisher";
import { NodeSnapshotFactory } from "../../domain/execution/NodeSnapshotFactory";
import { NodeExecutionStatePublisherFactory } from "../state/NodeExecutionStatePublisherFactory";
import { RuntimeContinuationDiagnostics } from "../../domain/execution/RuntimeContinuationDiagnosticsReporter";

import { ActivationEnqueueService } from "./ActivationEnqueueService";
import { RunStateSemantics } from "./RunStateSemantics";

export class RunContinuationService {
  constructor(
    private readonly activationIdFactory: ActivationIdFactory,
    private readonly runStore: RunStateStore,
    private readonly runDataFactory: RunDataFactory,
    private readonly executionContextFactory: ExecutionContextFactory,
    private readonly workflowSnapshotResolver: WorkflowSnapshotResolver,
    private readonly planningFactory: EngineWorkflowPlanningFactory,
    private readonly nodeStatePublisherFactory: NodeExecutionStatePublisherFactory,
    private readonly credentialResolverFactory: CredentialResolverFactory,
    private readonly activationEnqueueService: ActivationEnqueueService,
    private readonly nodeEventPublisher: NodeEventPublisher,
    private readonly semantics: RunStateSemantics,
    private readonly waiters: EngineWaiters,
    private readonly policyErrorServices: WorkflowPolicyErrorServices,
    private readonly terminalPersistence: RunTerminalPersistenceCoordinator,
    private readonly rootExecutionOptionsFactory: RootExecutionOptionsFactory,
  ) {}

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
    await this.nodeEventPublisher.publish("nodeStarted", snapshot);
  }

  async resumeFromNodeResult(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    outputs: NodeOutputs;
  }): Promise<RunResult> {
    const state = await this.runStore.load(args.runId);
    if (!state) throw new Error(`Unknown runId: ${args.runId}`);
    if (state.status !== "pending" || !state.pending) throw new Error(`Run ${args.runId} is not pending`);
    if (state.pending.activationId !== args.activationId) throw new Error(`activationId mismatch for run ${args.runId}`);
    if (state.pending.nodeId !== args.nodeId) throw new Error(`nodeId mismatch for run ${args.runId}`);

    const wf = this.resolvePersistedWorkflow(state);
    if (!wf) throw new Error(`Unknown workflowId: ${state.workflowId}`);

    const { topology, planner } = this.planningFactory.create(wf);

    const data = this.runDataFactory.create(state.outputsByNode);
    const limits = this.resolveEngineLimitsFromState(state);
    const base = this.createExecutionContext({
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      parent: state.parent,
      subworkflowDepth: state.executionOptions?.subworkflowDepth ?? 0,
      engineMaxNodeActivations: limits.engineMaxNodeActivations,
      engineMaxSubworkflowDepth: limits.engineMaxSubworkflowDepth,
      data,
      nodeState: this.nodeStatePublisherFactory.create(state.runId, state.workflowId, state.parent),
    });

    data.setOutputs(args.nodeId, args.outputs);
    const completedAt = new Date().toISOString();
    const completedSnapshot = this.semantics.createFinishedSnapshot({
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

    const completedActivations = (state.engineCounters?.completedNodeActivations ?? 0) + 1;
    const engineCounters = { completedNodeActivations: completedActivations };
    const maxNodeActivations = state.executionOptions?.maxNodeActivations ?? Number.MAX_SAFE_INTEGER;

    if (this.semantics.isStopConditionSatisfied(state.control?.stopCondition, args.nodeId)) {
      const completedState: PersistedRunState = {
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        parent: state.parent,
        executionOptions: state.executionOptions,
        control: state.control,
        workflowSnapshot: state.workflowSnapshot,
        mutableState: state.mutableState,
        policySnapshot: state.policySnapshot,
        engineCounters,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(state.nodeSnapshotsByNodeId ?? {}),
          [args.nodeId]: completedSnapshot,
        },
      };
      await this.runStore.save(completedState);
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.terminalPersistence.maybeDeleteAfterTerminalState({
        workflow: wf,
        state: completedState,
        finalStatus: "completed",
        finishedAt: completedAt,
      });
      const result: RunResult = {
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        status: "completed",
        outputs: this.semantics.resolveResultOutputs(wf, state.control?.stopCondition, data.dump()),
      };
      this.waiters.resolveRunCompletion(result);
      return result;
    }

    const batchId = state.pending.batchId ?? "batch_1";
    const queue: RunQueueEntry[] = (state.queue ?? []).map((q) => ({ ...q, batchId: q.batchId ?? batchId }));
    const nextNodeSnapshotsByNodeId = {
      ...(state.nodeSnapshotsByNodeId ?? {}),
      [args.nodeId]: completedSnapshot,
    };

    planner.applyOutputs(queue, { fromNodeId: args.nodeId, outputs: args.outputs as any, batchId });
    this.semantics.applyPinnedQueueSkips({
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

    let next: ReturnType<(typeof planner)["nextActivation"]>;
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

      const completedState: PersistedRunState = {
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        parent: state.parent,
        executionOptions: state.executionOptions,
        control: state.control,
        workflowSnapshot: state.workflowSnapshot,
        mutableState: state.mutableState,
        policySnapshot: state.policySnapshot,
        engineCounters,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: nextNodeSnapshotsByNodeId,
      };
      await this.runStore.save(completedState);
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.terminalPersistence.maybeDeleteAfterTerminalState({
        workflow: wf,
        state: completedState,
        finalStatus: "completed",
        finishedAt: completedAt,
      });

      const result: RunResult = { runId: state.runId, workflowId: state.workflowId, startedAt: state.startedAt, status: "completed", outputs };
      this.waiters.resolveRunCompletion(result);
      return result;
    }

    if (completedActivations >= maxNodeActivations) {
      const message = `Run exceeded maxNodeActivations (${maxNodeActivations}) after ${completedActivations} completed node activations (next would be ${next.nodeId}).`;
      const failedState: PersistedRunState = {
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        parent: state.parent,
        executionOptions: state.executionOptions,
        control: state.control,
        workflowSnapshot: state.workflowSnapshot,
        mutableState: state.mutableState,
        policySnapshot: state.policySnapshot,
        engineCounters,
        status: "failed",
        pending: undefined,
        queue: queue.map((q) => ({ ...q })),
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: nextNodeSnapshotsByNodeId,
      };
      await this.runStore.save(failedState);
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.terminalPersistence.maybeDeleteAfterTerminalState({
        workflow: wf,
        state: failedState,
        finalStatus: "failed",
        finishedAt: completedAt,
      });
      const result: RunResult = {
        runId: state.runId,
        workflowId: state.workflowId,
        startedAt: state.startedAt,
        status: "failed",
        error: { message },
      };
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
      getCredential: this.credentialResolverFactory.create(state.workflowId, def.id, def.config),
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

    const { queuedSnapshot, result } = await this.activationEnqueueService.enqueueActivationWithSnapshot({
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      parent: state.parent,
      executionOptions: state.executionOptions,
      control: state.control,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
      policySnapshot: state.policySnapshot,
      pendingQueue: queue,
      request,
      previousNodeSnapshotsByNodeId: nextNodeSnapshotsByNodeId,
      planner,
      engineCounters,
    });
    await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
    await this.nodeEventPublisher.publish("nodeQueued", queuedSnapshot);
    return result;
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

    if (failedDefinition && failedDefinition.kind === "node") {
      const nodeHandler = this.policyErrorServices.resolveNodeErrorHandler(failedDefinition.config.nodeErrorHandler);
      if (nodeHandler) {
        try {
          const ctx = this.buildNodeExecutionContextForPending(state, wf, failedDefinition, args.nodeId);
          const inputsByPort = state.pending.inputsByPort;
          const portKeys = Object.keys(inputsByPort);
          const kind = portKeys.length === 1 && portKeys[0] === "in" ? ("single" as const) : ("multi" as const);
          const items = inputsByPort.in ?? [];
          const recovered = await nodeHandler.handle({
            kind,
            items,
            inputsByPort: kind === "multi" ? inputsByPort : undefined,
            ctx,
            error: args.error,
          });
          return await this.resumeFromNodeResult({
            runId: args.runId,
            activationId: args.activationId,
            nodeId: args.nodeId,
            outputs: recovered,
          });
        } catch {
          // fall through to workflow-level failure
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const message = args.error?.message ?? String(args.error);
    const failedSnapshot = NodeSnapshotFactory.failed({
      previous: state.nodeSnapshotsByNodeId?.[args.nodeId],
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: state.parent,
      finishedAt,
      inputsByPort: state.pending.inputsByPort,
      error: args.error,
    });
    const failedState: PersistedRunState = {
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      parent: state.parent,
      executionOptions: state.executionOptions,
      control: state.control,
      workflowSnapshot: state.workflowSnapshot,
      mutableState: state.mutableState,
      policySnapshot: state.policySnapshot,
      engineCounters: state.engineCounters,
      status: "failed",
      pending: undefined,
      queue: (state.queue ?? []).map((q) => ({ ...q })),
      outputsByNode: state.outputsByNode,
      nodeSnapshotsByNodeId: {
        ...(state.nodeSnapshotsByNodeId ?? {}),
        [args.nodeId]: failedSnapshot,
      },
    };
    await this.runStore.save(failedState);
    await this.nodeEventPublisher.publish("nodeFailed", failedSnapshot);

    const wfErr = this.policyErrorServices.resolveWorkflowErrorHandler(wf.workflowErrorHandler);
    if (wfErr) {
      await Promise.resolve(
        wfErr.onError({
          runId: state.runId,
          workflowId: state.workflowId,
          workflow: wf,
          failedNodeId: args.nodeId,
          error: args.error,
          startedAt: state.startedAt,
          finishedAt,
        }),
      );
    }

    await this.terminalPersistence.maybeDeleteAfterTerminalState({
      workflow: wf,
      state: failedState,
      finalStatus: "failed",
      finishedAt,
    });

    const result: RunResult = { runId: state.runId, workflowId: state.workflowId, startedAt: state.startedAt, status: "failed", error: { message } };
    this.waiters.resolveRunCompletion(result);
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
      const outputs = wf ? this.semantics.resolveResultOutputs(wf, existing.control?.stopCondition, existing.outputsByNode) : [];
      return { runId: existing.runId, workflowId: existing.workflowId, startedAt: existing.startedAt, status: "completed", outputs };
    }
    if (existing?.status === "failed") {
      return { runId: existing.runId, workflowId: existing.workflowId, startedAt: existing.startedAt, status: "failed", error: { message: "Run failed" } };
    }

    const result = await this.waiters.waitForCompletion(runId);
    if (result.status !== "completed" && result.status !== "failed") {
      throw new Error(`Unexpected run completion status: ${result.status}`);
    }
    return result;
  }

  async waitForWebhookResponse(runId: RunId): Promise<WebhookRunResult> {
    return await this.waiters.waitForWebhookResponse(runId);
  }

  private async resumeFromWebhookControl(args: {
    state: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>;
    workflow: WorkflowDefinition;
    args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error };
    signal: WebhookControlSignal;
  }): Promise<RunResult> {
    const data = this.runDataFactory.create(args.state.outputsByNode);
    const { topology, planner } = this.planningFactory.create(args.workflow);

    const continuedItems = args.signal.kind === "respondNowAndContinue" ? (args.signal.continueItems ?? []) : args.signal.responseItems;
    const triggerOutputs: NodeOutputs = { main: continuedItems };
    data.setOutputs(args.args.nodeId, triggerOutputs);

    const completedSnapshot = this.semantics.createFinishedSnapshot({
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

    const completedActivations = (args.state.engineCounters?.completedNodeActivations ?? 0) + 1;
    const engineCounters = { completedNodeActivations: completedActivations };
    const maxNodeActivations = args.state.executionOptions?.maxNodeActivations ?? Number.MAX_SAFE_INTEGER;

    if (this.semantics.isStopConditionSatisfied(args.state.control?.stopCondition, args.args.nodeId)) {
      const completedState: PersistedRunState = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        control: args.state.control,
        workflowSnapshot: args.state.workflowSnapshot,
        mutableState: args.state.mutableState,
        policySnapshot: args.state.policySnapshot,
        engineCounters,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
      };
      await this.runStore.save(completedState);
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.terminalPersistence.maybeDeleteAfterTerminalState({
        workflow: args.workflow,
        state: completedState,
        finalStatus: "completed",
        finishedAt: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });
      this.waiters.resolveWebhookResponse({
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
        outputs: this.semantics.resolveResultOutputs(args.workflow, args.state.control?.stopCondition, data.dump()),
      };
      this.waiters.resolveRunCompletion(result);
      return result;
    }

    if (args.signal.kind === "respondNow") {
      const completedState: PersistedRunState = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        control: args.state.control,
        workflowSnapshot: args.state.workflowSnapshot,
        mutableState: args.state.mutableState,
        policySnapshot: args.state.policySnapshot,
        engineCounters,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
      };
      await this.runStore.save(completedState);
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.terminalPersistence.maybeDeleteAfterTerminalState({
        workflow: args.workflow,
        state: completedState,
        finalStatus: "completed",
        finishedAt: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });

      const result: RunResult = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        status: "completed",
        outputs: args.signal.responseItems,
      };
      this.waiters.resolveWebhookResponse({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        runStatus: "completed",
        response: args.signal.responseItems,
      });
      this.waiters.resolveRunCompletion(result);
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
      const completedState: PersistedRunState = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        control: args.state.control,
        workflowSnapshot: args.state.workflowSnapshot,
        mutableState: args.state.mutableState,
        policySnapshot: args.state.policySnapshot,
        engineCounters,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
      };
      await this.runStore.save(completedState);
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.terminalPersistence.maybeDeleteAfterTerminalState({
        workflow: args.workflow,
        state: completedState,
        finalStatus: "completed",
        finishedAt: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });

      const result: RunResult = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        status: "completed",
        outputs,
      };
      this.waiters.resolveWebhookResponse({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        runStatus: "completed",
        response: args.signal.responseItems,
      });
      this.waiters.resolveRunCompletion(result);
      return result;
    }

    if (completedActivations >= maxNodeActivations) {
      const message = `Run exceeded maxNodeActivations (${maxNodeActivations}) after ${completedActivations} completed node activations (next would be ${next.nodeId}).`;
      const failedState: PersistedRunState = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        parent: args.state.parent,
        executionOptions: args.state.executionOptions,
        control: args.state.control,
        workflowSnapshot: args.state.workflowSnapshot,
        mutableState: args.state.mutableState,
        policySnapshot: args.state.policySnapshot,
        engineCounters,
        status: "failed",
        pending: undefined,
        queue: queue.map((q) => ({ ...q })),
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
      };
      await this.runStore.save(failedState);
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.terminalPersistence.maybeDeleteAfterTerminalState({
        workflow: args.workflow,
        state: failedState,
        finalStatus: "failed",
        finishedAt: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });
      const result: RunResult = {
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        status: "failed",
        error: { message },
      };
      this.waiters.resolveWebhookResponse({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        runStatus: "pending",
        response: args.signal.responseItems,
      });
      this.waiters.resolveRunCompletion(result);
      return result;
    }

    const nextDefinition = topology.defsById.get(next.nodeId);
    if (!nextDefinition || nextDefinition.kind !== "node") {
      throw new Error(`Node ${next.nodeId} is not a runnable node`);
    }

    const webhookLimits = this.resolveEngineLimitsFromState(args.state);
    const base = this.createExecutionContext({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      nodeId: nextDefinition.id,
      parent: args.state.parent,
      subworkflowDepth: args.state.executionOptions?.subworkflowDepth ?? 0,
      engineMaxNodeActivations: webhookLimits.engineMaxNodeActivations,
      engineMaxSubworkflowDepth: webhookLimits.engineMaxSubworkflowDepth,
      data,
      nodeState: this.nodeStatePublisherFactory.create(args.state.runId, args.state.workflowId, args.state.parent),
    });
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: NodeExecutionContext = {
      ...base,
      data,
      nodeId: nextDefinition.id,
      activationId,
      config: nextDefinition.config,
      binary: base.binary.forNode({ nodeId: nextDefinition.id, activationId }),
      getCredential: this.credentialResolverFactory.create(args.state.workflowId, nextDefinition.id, nextDefinition.config),
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

    const { queuedSnapshot, result } = await this.activationEnqueueService.enqueueActivationWithSnapshot({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      startedAt: args.state.startedAt,
      parent: args.state.parent,
      executionOptions: args.state.executionOptions,
      control: args.state.control,
      workflowSnapshot: args.state.workflowSnapshot,
      mutableState: args.state.mutableState,
      policySnapshot: args.state.policySnapshot,
      pendingQueue: queue,
      request,
      previousNodeSnapshotsByNodeId: {
        ...(args.state.nodeSnapshotsByNodeId ?? {}),
        [args.args.nodeId]: completedSnapshot,
      },
      planner,
      engineCounters,
    });
    await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
    await this.nodeEventPublisher.publish("nodeQueued", queuedSnapshot);
    this.waiters.resolveWebhookResponse({
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      startedAt: args.state.startedAt,
      runStatus: "pending",
      response: args.signal.responseItems,
    });
    return result;
  }

  private asWebhookControlSignal(error: Error): WebhookControlSignal | undefined {
    const candidate = error as Partial<WebhookControlSignal> | undefined;
    if (!candidate || candidate.__webhookControl !== true) return undefined;
    if (candidate.kind !== "respondNow" && candidate.kind !== "respondNowAndContinue") return undefined;
    if (!Array.isArray(candidate.responseItems)) return undefined;
    return candidate as WebhookControlSignal;
  }

  private resolvePersistedWorkflow(state: {
    workflowId: WorkflowId;
    workflowSnapshot?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
  }): WorkflowDefinition | undefined {
    return this.workflowSnapshotResolver.resolve({
      workflowId: state.workflowId,
      workflowSnapshot: state.workflowSnapshot,
    });
  }

  private buildNodeExecutionContextForPending(
    state: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>,
    wf: WorkflowDefinition,
    def: Readonly<{ id: NodeId; config: NodeExecutionContext["config"] }>,
    nodeId: NodeId,
  ): NodeExecutionContext {
    const data = this.runDataFactory.create(state.outputsByNode);
    const limits = this.resolveEngineLimitsFromState(state);
    const base = this.createExecutionContext({
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId,
      parent: state.parent,
      subworkflowDepth: state.executionOptions?.subworkflowDepth ?? 0,
      engineMaxNodeActivations: limits.engineMaxNodeActivations,
      engineMaxSubworkflowDepth: limits.engineMaxSubworkflowDepth,
      data,
      nodeState: this.nodeStatePublisherFactory.create(state.runId, state.workflowId, state.parent),
    });
    const activationId = state.pending!.activationId;
    return {
      ...base,
      data,
      nodeId,
      activationId,
      config: def.config,
      binary: base.binary.forNode({ nodeId, activationId }),
      getCredential: this.credentialResolverFactory.create(wf.id, nodeId, def.config),
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
    nodeState?: NodeExecutionStatePublisher;
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

  private resolveEngineLimitsFromState(state: PersistedRunState): {
    engineMaxNodeActivations: number;
    engineMaxSubworkflowDepth: number;
  } {
    const fb = this.rootExecutionOptionsFactory.create();
    return {
      engineMaxNodeActivations: state.executionOptions?.maxNodeActivations ?? fb.maxNodeActivations!,
      engineMaxSubworkflowDepth: state.executionOptions?.maxSubworkflowDepth ?? fb.maxSubworkflowDepth!,
    };
  }
}


import type {
  ActivationIdFactory,
  EngineRunCounters,
  NodeActivationId,
  NodeActivationRequest,
  NodeExecutionContext,
  NodeExecutionSnapshot,
  NodeId,
  NodeInputsByPort,
  NodeOutputs,
  PendingNodeExecution,
  PersistedRunSchedulingState,
  PersistedRunState,
  RunDataFactory,
  RunId,
  RunQueueEntry,
  RunResult,
  WorkflowExecutionRepository,
  WebhookControlSignal,
  WebhookRunResult,
  WorkflowDefinition,
  WorkflowId,
  WorkflowSnapshotResolver,
} from "../types";

import { WorkflowTopology } from "../planning/WorkflowTopologyPlanner";
import { WorkflowExecutableNodeClassifierFactory } from "../workflow/definition/WorkflowExecutableNodeClassifierFactory";

import { CredentialResolverFactory } from "../execution/CredentialResolverFactory";
import type { EngineExecutionLimitsPolicy } from "../policies/executionLimits/EngineExecutionLimitsPolicy";
import { RunTerminalPersistenceCoordinator } from "../policies/storage/RunTerminalPersistenceCoordinator";
import { WorkflowPolicyErrorServices } from "../policies/WorkflowPolicyErrorServices";
import { EngineWorkflowPlanningFactory } from "../planning/EngineWorkflowPlanningFactory";
import type { EngineWaiters } from "../orchestration/EngineWaiters";
import { NodeEventPublisher } from "../events/NodeEventPublisher";

import { ActivationEnqueueService } from "../execution/ActivationEnqueueService";
import { NodeInputsByPortFactory } from "../execution/NodeInputsByPortFactory";
import { NodeExecutionSnapshotFactory } from "../execution/NodeExecutionSnapshotFactory";
import { NodeRunStateWriterFactory } from "../execution/NodeRunStateWriterFactory";
import { NodeActivationRequestComposer } from "../execution/NodeActivationRequestComposer";
import { PersistedRunStateTerminalBuilder } from "../execution/PersistedRunStateTerminalBuilder";
import { RunStateSemantics } from "../execution/RunStateSemantics";
import { WorkflowRunExecutionContextFactory } from "../execution/WorkflowRunExecutionContextFactory";

export class RunContinuationService {
  constructor(
    private readonly activationIdFactory: ActivationIdFactory,
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly runDataFactory: RunDataFactory,
    private readonly runExecutionContextFactory: WorkflowRunExecutionContextFactory,
    private readonly workflowSnapshotResolver: WorkflowSnapshotResolver,
    private readonly planningFactory: EngineWorkflowPlanningFactory,
    private readonly nodeStatePublisherFactory: NodeRunStateWriterFactory,
    private readonly credentialResolverFactory: CredentialResolverFactory,
    private readonly nodeActivationRequestComposer: NodeActivationRequestComposer,
    private readonly persistedRunStateTerminalBuilder: PersistedRunStateTerminalBuilder,
    private readonly activationEnqueueService: ActivationEnqueueService,
    private readonly nodeEventPublisher: NodeEventPublisher,
    private readonly semantics: RunStateSemantics,
    private readonly waiters: EngineWaiters,
    private readonly policyErrorServices: WorkflowPolicyErrorServices,
    private readonly terminalPersistence: RunTerminalPersistenceCoordinator,
    private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy,
  ) {}

  async markNodeRunning(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    inputsByPort: NodeInputsByPort;
  }): Promise<void> {
    const [state, schedulingState] = await Promise.all([
      this.workflowExecutionRepository.load(args.runId),
      this.workflowExecutionRepository.loadSchedulingState(args.runId),
    ]);
    const pendingExecution = schedulingState?.pending;
    if (!state || !pendingExecution) return;
    if (pendingExecution.activationId !== args.activationId || pendingExecution.nodeId !== args.nodeId) return;

    const startedAt = new Date().toISOString();
    const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
    const snapshot = NodeExecutionSnapshotFactory.running({
      previous,
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: state.parent,
      startedAt,
      inputsByPort: args.inputsByPort,
    });

    await this.workflowExecutionRepository.save({
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
    const [state, schedulingState] = await Promise.all([
      this.workflowExecutionRepository.load(args.runId),
      this.workflowExecutionRepository.loadSchedulingState(args.runId),
    ]);
    if (!state) throw new Error(`Unknown runId: ${args.runId}`);
    const pendingExecution = this.requirePendingExecution(
      args.runId,
      args.activationId,
      args.nodeId,
      state,
      schedulingState,
    );
    if (pendingExecution.activationId !== args.activationId)
      throw new Error(`activationId mismatch for run ${args.runId}`);
    if (pendingExecution.nodeId !== args.nodeId) throw new Error(`nodeId mismatch for run ${args.runId}`);

    const wf = this.resolvePersistedWorkflow(state);
    if (!wf) throw new Error(`Unknown workflowId: ${state.workflowId}`);

    const { topology, planner } = this.planningFactory.create(wf);

    const data = this.runDataFactory.create(state.outputsByNode);
    const limits = this.resolveEngineLimitsFromState(state);
    const base = this.runExecutionContextFactory.create({
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
      inputsByPort: pendingExecution.inputsByPort,
      outputs: args.outputs,
    });

    const completedActivations = (state.engineCounters?.completedNodeActivations ?? 0) + 1;
    const engineCounters = { completedNodeActivations: completedActivations };
    const maxNodeActivations = state.executionOptions?.maxNodeActivations ?? Number.MAX_SAFE_INTEGER;

    if (this.semantics.isStopConditionSatisfied(state.control?.stopCondition, args.nodeId)) {
      const completedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
        state,
        engineCounters,
        status: "completed",
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(state.nodeSnapshotsByNodeId ?? {}),
          [args.nodeId]: completedSnapshot,
        },
        finishedAtIso: completedAt,
      });
      await this.workflowExecutionRepository.save(completedState);
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

    const batchId = pendingExecution.batchId ?? "batch_1";
    const queue: RunQueueEntry[] = (schedulingState?.queue ?? []).map((q) => ({ ...q, batchId: q.batchId ?? batchId }));
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
      const completedNodeLabel = this.formatNodeLabel({
        definition: completedDefinition,
        nodeId: args.nodeId,
      });
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `After completing ${completedNodeLabel}, the engine could not plan the next activation. ${reason} Outputs: ${this.formatOutputCounts(args.outputs)}.`,
        { cause },
      );
    }
    if (!next) {
      const lastNodeId = WorkflowExecutableNodeClassifierFactory.create(wf).lastExecutableNodeIdInDefinitionOrder(wf);
      const outputs = data.getOutputItems(lastNodeId, "main");

      const completedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
        state,
        engineCounters,
        status: "completed",
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: nextNodeSnapshotsByNodeId,
        finishedAtIso: completedAt,
      });
      await this.workflowExecutionRepository.save(completedState);
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
        outputs,
      };
      this.waiters.resolveRunCompletion(result);
      return result;
    }

    if (completedActivations >= maxNodeActivations) {
      const message = `Run exceeded maxNodeActivations (${maxNodeActivations}) after ${completedActivations} completed node activations (next would be ${next.nodeId}).`;
      const failedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
        state,
        engineCounters,
        status: "failed",
        queue: queue.map((q) => ({ ...q })),
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: nextNodeSnapshotsByNodeId,
        finishedAtIso: completedAt,
      });
      await this.workflowExecutionRepository.save(failedState);
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

    const request = this.nodeActivationRequestComposer.createFromPlannedActivation({
      next,
      base,
      data,
      runId: state.runId,
      workflowId: state.workflowId,
      parent: state.parent,
      executionOptions: state.executionOptions,
      nodeDefinition: def,
    });

    try {
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
        connectionInvocations: state.connectionInvocations ?? [],
      });
      await this.nodeEventPublisher.publish("nodeCompleted", completedSnapshot);
      await this.nodeEventPublisher.publish("nodeQueued", queuedSnapshot);
      return result;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      return await this.terminateRunAfterActivationEnqueueRejected({
        wf,
        state,
        queue,
        nextNodeId: next.nodeId,
        request,
        completedSnapshot,
        nextNodeSnapshotsByNodeId,
        outputsByNode: data.dump(),
        engineCounters,
        error,
        completedAt,
      });
    }
  }

  async resumeFromNodeError(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    error: Error;
  }): Promise<RunResult> {
    const [state, schedulingState] = await Promise.all([
      this.workflowExecutionRepository.load(args.runId),
      this.workflowExecutionRepository.loadSchedulingState(args.runId),
    ]);
    if (!state) throw new Error(`Unknown runId: ${args.runId}`);
    const pendingExecution = this.requirePendingExecution(
      args.runId,
      args.activationId,
      args.nodeId,
      state,
      schedulingState,
    );
    if (pendingExecution.activationId !== args.activationId)
      throw new Error(`activationId mismatch for run ${args.runId}`);
    if (pendingExecution.nodeId !== args.nodeId) throw new Error(`nodeId mismatch for run ${args.runId}`);

    const wf = this.resolvePersistedWorkflow(state);
    if (!wf) throw new Error(`Unknown workflowId: ${state.workflowId}`);
    const failedDefinition = WorkflowTopology.fromWorkflow(wf).defsById.get(args.nodeId);
    const webhookControlSignal =
      state.executionOptions?.webhook && failedDefinition?.kind === "trigger"
        ? this.asWebhookControlSignal(args.error)
        : undefined;
    if (webhookControlSignal) {
      return await this.resumeFromWebhookControl({
        state,
        schedulingState,
        pendingExecution,
        workflow: wf,
        args,
        signal: webhookControlSignal,
      });
    }

    if (failedDefinition && failedDefinition.kind === "node") {
      const nodeHandler = this.policyErrorServices.resolveNodeErrorHandler(failedDefinition.config.nodeErrorHandler);
      if (nodeHandler) {
        try {
          const ctx = this.buildNodeExecutionContextForPending(
            state,
            pendingExecution,
            wf,
            failedDefinition,
            args.nodeId,
          );
          const inputsByPort = pendingExecution.inputsByPort;
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
    const failedSnapshot = NodeExecutionSnapshotFactory.failed({
      previous: state.nodeSnapshotsByNodeId?.[args.nodeId],
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: state.parent,
      finishedAt,
      inputsByPort: pendingExecution.inputsByPort,
      error: args.error,
    });
    const failedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
      state,
      engineCounters: state.engineCounters ?? { completedNodeActivations: 0 },
      status: "failed",
      queue: (schedulingState?.queue ?? []).map((q) => ({ ...q })),
      outputsByNode: state.outputsByNode,
      nodeSnapshotsByNodeId: {
        ...(state.nodeSnapshotsByNodeId ?? {}),
        [args.nodeId]: failedSnapshot,
      },
      finishedAtIso: finishedAt,
    });
    await this.workflowExecutionRepository.save(failedState);
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

  async resumeFromStepResult(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    outputs: NodeOutputs;
  }): Promise<RunResult> {
    return await this.resumeFromNodeResult(args);
  }

  async resumeFromStepError(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    error: Error;
  }): Promise<RunResult> {
    return await this.resumeFromNodeError(args);
  }

  async waitForCompletion(runId: RunId): Promise<Extract<RunResult, { status: "completed" | "failed" }>> {
    const existing = await this.workflowExecutionRepository.load(runId);
    if (existing?.status === "completed") {
      const wf = this.resolvePersistedWorkflow(existing);
      const outputs = wf
        ? this.semantics.resolveResultOutputs(wf, existing.control?.stopCondition, existing.outputsByNode)
        : [];
      return {
        runId: existing.runId,
        workflowId: existing.workflowId,
        startedAt: existing.startedAt,
        status: "completed",
        outputs,
      };
    }
    if (existing?.status === "failed") {
      return {
        runId: existing.runId,
        workflowId: existing.workflowId,
        startedAt: existing.startedAt,
        status: "failed",
        error: { message: "Run failed" },
      };
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
    state: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>;
    schedulingState: PersistedRunSchedulingState | undefined;
    pendingExecution: PendingNodeExecution;
    workflow: WorkflowDefinition;
    args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error };
    signal: WebhookControlSignal;
  }): Promise<RunResult> {
    const data = this.runDataFactory.create(args.state.outputsByNode);
    const { topology, planner } = this.planningFactory.create(args.workflow);

    const continuedItems =
      args.signal.kind === "respondNowAndContinue" ? (args.signal.continueItems ?? []) : args.signal.responseItems;
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
      inputsByPort: args.pendingExecution.inputsByPort,
      outputs: triggerOutputs,
    });

    const completedActivations = (args.state.engineCounters?.completedNodeActivations ?? 0) + 1;
    const engineCounters = { completedNodeActivations: completedActivations };
    const maxNodeActivations = args.state.executionOptions?.maxNodeActivations ?? Number.MAX_SAFE_INTEGER;

    if (this.semantics.isStopConditionSatisfied(args.state.control?.stopCondition, args.args.nodeId)) {
      const completedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
        state: args.state,
        engineCounters,
        status: "completed",
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
        finishedAtIso: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });
      await this.workflowExecutionRepository.save(completedState);
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
      const completedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
        state: args.state,
        engineCounters,
        status: "completed",
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
        finishedAtIso: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });
      await this.workflowExecutionRepository.save(completedState);
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

    const batchId = args.pendingExecution.batchId ?? "batch_1";
    const queue: RunQueueEntry[] = (args.schedulingState?.queue ?? []).map((entry) => ({
      ...entry,
      batchId: entry.batchId ?? batchId,
    }));
    planner.applyOutputs(queue, { fromNodeId: args.args.nodeId, outputs: triggerOutputs as any, batchId });
    const next = planner.nextActivation(queue);

    if (!next) {
      const lastNodeId = WorkflowExecutableNodeClassifierFactory.create(
        args.workflow,
      ).lastExecutableNodeIdInDefinitionOrder(args.workflow);
      const outputs = data.getOutputItems(lastNodeId, "main");
      const completedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
        state: args.state,
        engineCounters,
        status: "completed",
        queue: [],
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
        finishedAtIso: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });
      await this.workflowExecutionRepository.save(completedState);
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
      const failedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
        state: args.state,
        engineCounters,
        status: "failed",
        queue: queue.map((q) => ({ ...q })),
        outputsByNode: data.dump(),
        nodeSnapshotsByNodeId: {
          ...(args.state.nodeSnapshotsByNodeId ?? {}),
          [args.args.nodeId]: completedSnapshot,
        },
        finishedAtIso: completedSnapshot.finishedAt ?? completedSnapshot.updatedAt,
      });
      await this.workflowExecutionRepository.save(failedState);
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
    const base = this.runExecutionContextFactory.create({
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
    const request = this.nodeActivationRequestComposer.createFromPlannedActivation({
      next,
      base,
      data,
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      parent: args.state.parent,
      executionOptions: args.state.executionOptions,
      nodeDefinition: nextDefinition,
    });

    const mergedSnapshots = {
      ...(args.state.nodeSnapshotsByNodeId ?? {}),
      [args.args.nodeId]: completedSnapshot,
    };

    try {
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
        previousNodeSnapshotsByNodeId: mergedSnapshots,
        planner,
        engineCounters,
        connectionInvocations: args.state.connectionInvocations ?? [],
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
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      const finishedAt = completedSnapshot.finishedAt ?? completedSnapshot.updatedAt;
      const result = await this.terminateRunAfterActivationEnqueueRejected({
        wf: args.workflow,
        state: args.state,
        queue,
        nextNodeId: next.nodeId,
        request,
        completedSnapshot,
        nextNodeSnapshotsByNodeId: mergedSnapshots,
        outputsByNode: data.dump(),
        engineCounters,
        error,
        completedAt: finishedAt,
      });
      this.waiters.resolveWebhookResponse({
        runId: args.state.runId,
        workflowId: args.state.workflowId,
        startedAt: args.state.startedAt,
        runStatus: "pending",
        response: args.signal.responseItems,
      });
      return result;
    }
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
    workflowSnapshot?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
  }): WorkflowDefinition | undefined {
    return this.workflowSnapshotResolver.resolve({
      workflowId: state.workflowId,
      workflowSnapshot: state.workflowSnapshot,
    });
  }

  private buildNodeExecutionContextForPending(
    state: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>,
    pendingExecution: PendingNodeExecution,
    wf: WorkflowDefinition,
    def: Readonly<{ id: NodeId; config: NodeExecutionContext["config"] }>,
    nodeId: NodeId,
  ): NodeExecutionContext {
    const data = this.runDataFactory.create(state.outputsByNode);
    const limits = this.resolveEngineLimitsFromState(state);
    const base = this.runExecutionContextFactory.create({
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
    const activationId = pendingExecution.activationId;
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

  private requirePendingExecution(
    runId: RunId,
    activationId: NodeActivationId,
    nodeId: NodeId,
    state: PersistedRunState,
    schedulingState?: PersistedRunSchedulingState,
  ): PendingNodeExecution {
    if (state.status !== "pending") {
      throw new Error(`Run ${runId} is not pending`);
    }
    const pendingExecution = schedulingState?.pending;
    if (!pendingExecution) {
      throw new Error(`Run ${runId} is not pending`);
    }
    if (pendingExecution.activationId !== activationId) {
      throw new Error(`activationId mismatch for run ${runId}`);
    }
    if (pendingExecution.nodeId !== nodeId) {
      throw new Error(`nodeId mismatch for run ${runId}`);
    }
    return pendingExecution;
  }

  private resolveEngineLimitsFromState(state: PersistedRunState): {
    engineMaxNodeActivations: number;
    engineMaxSubworkflowDepth: number;
  } {
    const fb = this.executionLimitsPolicy.createRootExecutionOptions();
    return {
      engineMaxNodeActivations: state.executionOptions?.maxNodeActivations ?? fb.maxNodeActivations!,
      engineMaxSubworkflowDepth: state.executionOptions?.maxSubworkflowDepth ?? fb.maxSubworkflowDepth!,
    };
  }

  /**
   * Next activation could not be enqueued (e.g. input contract / mapping failed in the preparer).
   * Marks the target node failed and terminates the run.
   */
  private async terminateRunAfterActivationEnqueueRejected(
    args: Readonly<{
      wf: WorkflowDefinition;
      state: PersistedRunState;
      queue: RunQueueEntry[];
      nextNodeId: NodeId;
      request: NodeActivationRequest;
      completedSnapshot: NodeExecutionSnapshot;
      nextNodeSnapshotsByNodeId: NonNullable<PersistedRunState["nodeSnapshotsByNodeId"]>;
      outputsByNode: PersistedRunState["outputsByNode"];
      engineCounters: EngineRunCounters;
      error: Error;
      completedAt: string;
    }>,
  ): Promise<RunResult> {
    const finishedAt = args.completedAt;
    const inputsByPort = NodeInputsByPortFactory.fromRequest(args.request);
    const failedSnapshot = NodeExecutionSnapshotFactory.failed({
      previous: undefined,
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      nodeId: args.nextNodeId,
      activationId: args.request.activationId,
      parent: args.state.parent,
      finishedAt,
      inputsByPort,
      error: args.error,
    });
    const failedState = this.persistedRunStateTerminalBuilder.mergeTerminal({
      state: args.state,
      engineCounters: args.engineCounters,
      status: "failed",
      queue: args.queue.map((q) => ({ ...q })),
      outputsByNode: args.outputsByNode,
      nodeSnapshotsByNodeId: {
        ...args.nextNodeSnapshotsByNodeId,
        [args.nextNodeId]: failedSnapshot,
      },
      finishedAtIso: finishedAt,
    });
    await this.workflowExecutionRepository.save(failedState);
    await this.nodeEventPublisher.publish("nodeCompleted", args.completedSnapshot);
    await this.nodeEventPublisher.publish("nodeFailed", failedSnapshot);

    const wfErr = this.policyErrorServices.resolveWorkflowErrorHandler(args.wf.workflowErrorHandler);
    if (wfErr) {
      await Promise.resolve(
        wfErr.onError({
          runId: args.state.runId,
          workflowId: args.state.workflowId,
          workflow: args.wf,
          failedNodeId: args.nextNodeId,
          error: args.error,
          startedAt: args.state.startedAt,
          finishedAt,
        }),
      );
    }

    await this.terminalPersistence.maybeDeleteAfterTerminalState({
      workflow: args.wf,
      state: failedState,
      finalStatus: "failed",
      finishedAt,
    });

    const message = args.error.message ?? String(args.error);
    const result: RunResult = {
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      startedAt: args.state.startedAt,
      status: "failed",
      error: { message },
    };
    this.waiters.resolveRunCompletion(result);
    return result;
  }

  private formatNodeLabel(args: {
    definition?: Readonly<{ id: NodeId; name?: string; type: unknown }>;
    nodeId: NodeId;
  }): string {
    const tokenName = typeof args.definition?.type === "function" ? args.definition.type.name : "Node";
    return args.definition?.name
      ? `"${args.definition.name}" (${tokenName}:${args.nodeId})`
      : `${tokenName}:${args.nodeId}`;
  }

  private formatOutputCounts(outputs: NodeOutputs): string {
    const entries = Object.entries(outputs ?? {});
    if (entries.length === 0) {
      return "no outputs";
    }
    return entries.map(([port, items]) => `${port}=${items?.length ?? 0}`).join(", ");
  }
}

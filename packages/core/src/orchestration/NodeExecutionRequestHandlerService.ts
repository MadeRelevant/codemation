import type {
  NodeActivationContinuation,
  NodeExecutor,
  NodeExecutionRequest,
  NodeExecutionRequestHandler,
  PersistedRunState,
  RunDataFactory,
  WorkflowDefinition,
  WorkflowExecutionRepository,
  WorkflowSnapshotResolver,
} from "../types";
import type { EngineExecutionLimitsPolicy } from "../policies/executionLimits/EngineExecutionLimitsPolicy";
import { NodeActivationRequestComposer } from "../execution/NodeActivationRequestComposer";
import { NodeRunStateWriterFactory } from "../execution/NodeRunStateWriterFactory";
import { WorkflowRunExecutionContextFactory } from "../execution/WorkflowRunExecutionContextFactory";

type PersistedWorkflowLike = Readonly<{
  workflowId: PersistedRunState["workflowId"];
  workflowSnapshot?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
}>;

export class NodeExecutionRequestHandlerService implements NodeExecutionRequestHandler {
  constructor(
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly workflowSnapshotResolver: WorkflowSnapshotResolver,
    private readonly runDataFactory: RunDataFactory,
    private readonly runExecutionContextFactory: WorkflowRunExecutionContextFactory,
    private readonly nodeStatePublisherFactory: NodeRunStateWriterFactory,
    private readonly nodeActivationRequestComposer: NodeActivationRequestComposer,
    private readonly nodeExecutor: NodeExecutor,
    private readonly continuation: NodeActivationContinuation,
    private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy,
  ) {}

  async handleNodeExecutionRequest(request: NodeExecutionRequest): Promise<void> {
    const [state, schedulingState] = await Promise.all([
      this.workflowExecutionRepository.load(request.runId),
      this.workflowExecutionRepository.loadSchedulingState(request.runId),
    ]);
    if (!state) {
      throw new Error(`Unknown runId: ${request.runId}`);
    }
    if (state.workflowId !== request.workflowId) {
      throw new Error(`workflowId mismatch for run ${request.runId}: ${state.workflowId} vs ${request.workflowId}`);
    }
    const pendingExecution = schedulingState?.pending;
    if (state.status !== "pending" || !pendingExecution) {
      return;
    }
    if (pendingExecution.activationId !== request.activationId || pendingExecution.nodeId !== request.nodeId) {
      return;
    }

    const workflow = this.resolvePersistedWorkflow(state);
    if (!workflow) {
      throw new Error(`Unknown workflowId: ${state.workflowId}`);
    }
    const definition = workflow.nodes.find((node) => node.id === request.nodeId);
    if (!definition) {
      throw new Error(`Unknown nodeId: ${request.nodeId}`);
    }
    if (definition.kind !== "node") {
      throw new Error(`Node ${request.nodeId} is not runnable`);
    }

    const resolvedParent = request.parent ?? state.parent;
    const data = this.runDataFactory.create(state.outputsByNode);
    const limits = this.resolveEngineLimitsFromState(state);
    const persistedInput = pendingExecution.inputsByPort.in ?? request.input;
    const base = this.runExecutionContextFactory.create({
      runId: state.runId,
      workflowId: state.workflowId,
      nodeId: request.nodeId,
      parent: resolvedParent,
      subworkflowDepth: state.executionOptions?.subworkflowDepth ?? 0,
      engineMaxNodeActivations: limits.engineMaxNodeActivations,
      engineMaxSubworkflowDepth: limits.engineMaxSubworkflowDepth,
      data,
      nodeState: this.nodeStatePublisherFactory.create(state.runId, state.workflowId, resolvedParent),
    });
    const activationRequest = this.nodeActivationRequestComposer.createSingleFromDefinitionWithActivation({
      activationId: request.activationId,
      runId: request.runId,
      workflowId: request.workflowId,
      parent: resolvedParent,
      executionOptions: request.executionOptions ?? state.executionOptions,
      base,
      data,
      definition: {
        id: definition.id,
        config: definition.config,
      },
      batchId: pendingExecution.batchId ?? "batch_1",
      input: persistedInput,
    });

    await this.continuation.markNodeRunning({
      runId: activationRequest.runId,
      activationId: activationRequest.activationId,
      nodeId: activationRequest.nodeId,
      inputsByPort: pendingExecution.inputsByPort,
    });

    let outputs;
    try {
      outputs = await this.nodeExecutor.execute(activationRequest);
    } catch (error) {
      await this.resumeAfterExecutionError(activationRequest, this.asError(error));
      return;
    }

    await this.resumeAfterExecutionResult(activationRequest, outputs ?? {});
  }

  private resolvePersistedWorkflow(state: PersistedWorkflowLike): WorkflowDefinition | undefined {
    return this.workflowSnapshotResolver.resolve({
      workflowId: state.workflowId,
      workflowSnapshot: state.workflowSnapshot,
    });
  }

  private resolveEngineLimitsFromState(state: PersistedRunState): {
    engineMaxNodeActivations: number;
    engineMaxSubworkflowDepth: number;
  } {
    const fallback = this.executionLimitsPolicy.createRootExecutionOptions();
    return {
      engineMaxNodeActivations: state.executionOptions?.maxNodeActivations ?? fallback.maxNodeActivations!,
      engineMaxSubworkflowDepth: state.executionOptions?.maxSubworkflowDepth ?? fallback.maxSubworkflowDepth!,
    };
  }

  private async resumeAfterExecutionResult(
    request: ReturnType<NodeActivationRequestComposer["createSingleFromDefinitionWithActivation"]>,
    outputs: unknown,
  ): Promise<void> {
    try {
      await this.continuation.resumeFromNodeResult({
        runId: request.runId,
        activationId: request.activationId,
        nodeId: request.nodeId,
        outputs: outputs as never,
      });
    } catch (error) {
      this.rethrowUnlessIgnorableContinuationError(error);
    }
  }

  private async resumeAfterExecutionError(
    request: ReturnType<NodeActivationRequestComposer["createSingleFromDefinitionWithActivation"]>,
    error: Error,
  ): Promise<void> {
    try {
      await this.continuation.resumeFromNodeError({
        runId: request.runId,
        activationId: request.activationId,
        nodeId: request.nodeId,
        error,
      });
    } catch (continuationError) {
      this.rethrowUnlessIgnorableContinuationError(continuationError);
    }
  }

  private asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private rethrowUnlessIgnorableContinuationError(error: unknown): void {
    if (this.isIgnorableContinuationError(error)) {
      return;
    }
    throw this.asError(error);
  }

  private isIgnorableContinuationError(error: unknown): boolean {
    const message = this.asError(error).message;
    return (
      message.includes(" is not pending") ||
      message.includes("activationId mismatch") ||
      message.includes("nodeId mismatch")
    );
  }
}

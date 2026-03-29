import type {
  CurrentStateExecutionRequest,
  HttpMethod,
  Items,
  NodeActivationContinuation,
  NodeActivationId,
  NodeId,
  NodeInputsByPort,
  NodeOutputs,
  ParentExecutionRef,
  PersistedWorkflowTokenRegistryLike,
  RunExecutionOptions,
  RunId,
  RunResult,
  WorkflowExecutionRepository,
  WebhookRunResult,
  WebhookTriggerMatcher,
  WebhookTriggerResolution,
  WorkflowDefinition,
  WorkflowId,
  LiveWorkflowRepository,
  WorkflowSnapshotResolver,
} from "../types";

interface EngineTriggerRuntime {
  startTriggers(): Promise<void>;
  stop(): Promise<void>;
  syncWorkflowTriggersForActivation(workflowId: WorkflowId): Promise<void>;
  createTriggerTestItems(args: { workflow: WorkflowDefinition; nodeId: NodeId }): Promise<Items | undefined>;
}

interface EngineRunStartService {
  runWorkflow(
    wf: WorkflowDefinition,
    startAt: NodeId,
    items: Items,
    parent?: ParentExecutionRef,
    executionOptions?: RunExecutionOptions,
    persistedStateOverrides?: Readonly<{
      workflowSnapshot?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
      mutableState?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"];
    }>,
  ): Promise<RunResult>;
  runWorkflowFromState(request: CurrentStateExecutionRequest): Promise<RunResult>;
}

interface EngineRunContinuationService {
  markNodeRunning(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    inputsByPort: NodeInputsByPort;
  }): Promise<void>;
  resumeFromNodeResult(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    outputs: NodeOutputs;
  }): Promise<RunResult>;
  resumeFromNodeError(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    error: Error;
  }): Promise<RunResult>;
  resumeFromStepResult(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    outputs: NodeOutputs;
  }): Promise<RunResult>;
  resumeFromStepError(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    error: Error;
  }): Promise<RunResult>;
  waitForCompletion(runId: RunId): Promise<Extract<RunResult, { status: "completed" | "failed" }>>;
  waitForWebhookResponse(runId: RunId): Promise<WebhookRunResult>;
}

export interface EngineFacadeDeps {
  liveWorkflowRepository: LiveWorkflowRepository;
  tokenRegistry: PersistedWorkflowTokenRegistryLike;
  webhookTriggerMatcher: WebhookTriggerMatcher;
  workflowSnapshotResolver: WorkflowSnapshotResolver;
  triggerRuntime: EngineTriggerRuntime;
  runStartService: EngineRunStartService;
  runContinuationService: EngineRunContinuationService;
}

/**
 * Runtime facade for orchestration, continuation, triggers, and webhook routing.
 * Prefer {@link import("../intents/RunIntentService").RunIntentService} for host/HTTP invocation boundaries.
 * The class token is exported from `@codemation/core/bootstrap` (not the main `@codemation/core` barrel).
 */
export class Engine implements NodeActivationContinuation {
  constructor(private readonly deps: EngineFacadeDeps) {}

  loadWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    this.deps.tokenRegistry.registerFromWorkflows?.(workflows);
    this.deps.liveWorkflowRepository.setWorkflows(workflows);
    this.deps.webhookTriggerMatcher.onEngineWorkflowsLoaded?.();
  }

  getTokenRegistry(): EngineFacadeDeps["tokenRegistry"] {
    return this.deps.tokenRegistry;
  }

  resolveWorkflowSnapshot(args: {
    workflowId: WorkflowId;
    workflowSnapshot?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
  }): WorkflowDefinition | undefined {
    return this.deps.workflowSnapshotResolver.resolve(args);
  }

  async startTriggers(): Promise<void> {
    return await this.deps.triggerRuntime.startTriggers();
  }

  async syncWorkflowTriggersForActivation(workflowId: WorkflowId): Promise<void> {
    await this.deps.triggerRuntime.syncWorkflowTriggersForActivation(workflowId);
    this.deps.webhookTriggerMatcher.reloadWebhookRoutes?.();
  }

  async start(workflows: WorkflowDefinition[]): Promise<void> {
    await this.stop();
    this.loadWorkflows(workflows);
    await this.startTriggers();
  }

  async stop(): Promise<void> {
    await this.deps.triggerRuntime.stop();
    this.deps.webhookTriggerMatcher.onEngineStopped?.();
  }

  resolveWebhookTrigger(args: { endpointPath: string; method: HttpMethod }): WebhookTriggerResolution {
    const entry = this.deps.webhookTriggerMatcher.lookup(args.endpointPath);
    if (!entry) {
      return { status: "notFound" };
    }
    if (!entry.methods.includes(args.method)) {
      return { status: "methodNotAllowed", match: entry };
    }
    return { status: "ok", match: entry };
  }

  async createTriggerTestItems(args: { workflow: WorkflowDefinition; nodeId: NodeId }): Promise<Items | undefined> {
    return await this.deps.triggerRuntime.createTriggerTestItems(args);
  }

  async runWorkflow(
    wf: WorkflowDefinition,
    startAt: NodeId,
    items: Items,
    parent?: ParentExecutionRef,
    executionOptions?: RunExecutionOptions,
    persistedStateOverrides?: Readonly<{
      workflowSnapshot?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["workflowSnapshot"];
      mutableState?: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"];
    }>,
  ): Promise<RunResult> {
    return await this.deps.runStartService.runWorkflow(
      wf,
      startAt,
      items,
      parent,
      executionOptions,
      persistedStateOverrides,
    );
  }

  async runWorkflowFromState(request: CurrentStateExecutionRequest): Promise<RunResult> {
    return await this.deps.runStartService.runWorkflowFromState(request);
  }

  async markNodeRunning(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    inputsByPort: NodeInputsByPort;
  }): Promise<void> {
    return await this.deps.runContinuationService.markNodeRunning(args);
  }

  async resumeFromNodeResult(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    outputs: NodeOutputs;
  }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromNodeResult(args);
  }

  async resumeFromNodeError(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    error: Error;
  }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromNodeError(args);
  }

  async resumeFromStepResult(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    outputs: NodeOutputs;
  }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromStepResult(args);
  }

  async resumeFromStepError(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    error: Error;
  }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromStepError(args);
  }

  async waitForCompletion(runId: RunId): Promise<Extract<RunResult, { status: "completed" | "failed" }>> {
    return await this.deps.runContinuationService.waitForCompletion(runId);
  }

  async waitForWebhookResponse(runId: RunId): Promise<WebhookRunResult> {
    return await this.deps.runContinuationService.waitForWebhookResponse(runId);
  }
}

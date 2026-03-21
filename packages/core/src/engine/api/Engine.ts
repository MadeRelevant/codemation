import type {
  CurrentStateExecutionRequest,
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
  RunStateStore,
  WebhookRunResult,
  WebhookTriggerMatcher,
  WorkflowDefinition,
  WorkflowId,
  WorkflowCatalog,
  WorkflowSnapshotResolver,
} from "../../types";

interface EngineTriggerRuntime {
  startTriggers(): Promise<void>;
  stop(): Promise<void>;
  createTriggerTestItems(args: { workflow: WorkflowDefinition; nodeId: NodeId }): Promise<Items | undefined>;
}

interface EngineWorkflowRunStarter {
  runWorkflow(
    wf: WorkflowDefinition,
    startAt: NodeId,
    items: Items,
    parent?: ParentExecutionRef,
    executionOptions?: RunExecutionOptions,
    persistedStateOverrides?: Readonly<{
      workflowSnapshot?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
      mutableState?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    }>,
  ): Promise<RunResult>;
}

interface EngineCurrentStateRunStarter {
  runWorkflowFromState(request: CurrentStateExecutionRequest): Promise<RunResult>;
}

interface EngineRunContinuationService {
  markNodeRunning(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; inputsByPort: NodeInputsByPort }): Promise<void>;
  resumeFromNodeResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult>;
  resumeFromNodeError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult>;
  resumeFromStepResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult>;
  resumeFromStepError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult>;
  waitForCompletion(runId: RunId): Promise<Extract<RunResult, { status: "completed" | "failed" }>>;
  waitForWebhookResponse(runId: RunId): Promise<WebhookRunResult>;
}

export interface EngineFacadeDeps {
  workflowCatalog: WorkflowCatalog;
  tokenRegistry: PersistedWorkflowTokenRegistryLike;
  webhookTriggerMatcher: WebhookTriggerMatcher;
  workflowSnapshotResolver: WorkflowSnapshotResolver;
  triggerRuntime: EngineTriggerRuntime;
  workflowRunStarter: EngineWorkflowRunStarter;
  currentStateRunStarter: EngineCurrentStateRunStarter;
  runContinuationService: EngineRunContinuationService;
}

export class Engine implements NodeActivationContinuation {
  constructor(private readonly deps: EngineFacadeDeps) {}

  loadWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    this.deps.tokenRegistry.registerFromWorkflows?.(workflows);
    this.deps.workflowCatalog.setWorkflows(workflows);
  }

  getTokenRegistry(): EngineFacadeDeps["tokenRegistry"] {
    return this.deps.tokenRegistry;
  }

  resolveWorkflowSnapshot(args: {
    workflowId: WorkflowId;
    workflowSnapshot?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
  }): WorkflowDefinition | undefined {
    return this.deps.workflowSnapshotResolver.resolve(args);
  }

  async startTriggers(): Promise<void> {
    return await this.deps.triggerRuntime.startTriggers();
  }

  async start(workflows: WorkflowDefinition[]): Promise<void> {
    await this.stop();
    this.loadWorkflows(workflows);
    await this.startTriggers();
  }

  async stop(): Promise<void> {
    return await this.deps.triggerRuntime.stop();
  }

  matchWebhookTrigger(args: { endpointId: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" }) {
    return this.deps.webhookTriggerMatcher.match(args);
  }

  findWebhookTrigger(endpointId: string) {
    return this.deps.webhookTriggerMatcher.lookup(endpointId);
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
      workflowSnapshot?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"];
      mutableState?: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
    }>,
  ): Promise<RunResult> {
    return await this.deps.workflowRunStarter.runWorkflow(wf, startAt, items, parent, executionOptions, persistedStateOverrides);
  }

  async runWorkflowFromState(request: CurrentStateExecutionRequest): Promise<RunResult> {
    return await this.deps.currentStateRunStarter.runWorkflowFromState(request);
  }

  async markNodeRunning(args: {
    runId: RunId;
    activationId: NodeActivationId;
    nodeId: NodeId;
    inputsByPort: NodeInputsByPort;
  }): Promise<void> {
    return await this.deps.runContinuationService.markNodeRunning(args);
  }

  async resumeFromNodeResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromNodeResult(args);
  }

  async resumeFromNodeError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromNodeError(args);
  }

  async resumeFromStepResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromStepResult(args);
  }

  async resumeFromStepError(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; error: Error }): Promise<RunResult> {
    return await this.deps.runContinuationService.resumeFromStepError(args);
  }

  async waitForCompletion(runId: RunId): Promise<Extract<RunResult, { status: "completed" | "failed" }>> {
    return await this.deps.runContinuationService.waitForCompletion(runId);
  }

  async waitForWebhookResponse(runId: RunId): Promise<WebhookRunResult> {
    return await this.deps.runContinuationService.waitForWebhookResponse(runId);
  }
}


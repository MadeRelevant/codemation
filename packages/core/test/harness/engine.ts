import type {
  Container,
  CredentialSessionService,
  ExecutionContextFactory,
  NodeExecutionRequest,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
  PersistedTriggerSetupState,
  RunDataFactory,
  RunEventBus,
  RunIdFactory,
  RunResult,
  TriggerSetupStateRepository,
  WorkflowExecutionRepository,
  WorkflowDefinition,
  WorkflowRunnerService,
} from "../../src/index.ts";

import type { DependencyContainer, InjectionToken } from "tsyringe";
import { container as tsyringeContainer } from "tsyringe";
import {
  AllWorkflowsActiveWorkflowActivationPolicy,
  CoreTokens,
  InMemoryRunEventBus,
  RunIntentService,
} from "../../src/index.ts";
import {
  DefaultDrivingScheduler,
  DefaultAsyncSleeper,
  DefaultExecutionContextFactory,
  EngineExecutionLimitsPolicy,
  Engine,
  EngineRuntimeRegistrar,
  EngineWorkflowRunnerService,
  HintOnlyOffloadPolicy,
  InProcessRetryRunner,
  InMemoryRunDataFactory,
  InMemoryWorkflowExecutionRepository,
  InlineDrivingScheduler,
  NodeExecutor,
  NodeInstanceFactory,
  PersistedWorkflowTokenRegistry,
  type EngineRuntimeRegistrationOptions,
} from "../../src/bootstrap/index.ts";
import { InMemoryLiveWorkflowRepository, RejectingCredentialSessionService } from "../../src/testing.ts";
import { SubWorkflowRunnerNode } from "./nodes.js";

export class CapturingScheduler implements NodeExecutionScheduler {
  lastRequest: NodeExecutionRequest | undefined;
  requests: NodeExecutionRequest[] = [];

  async enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    this.lastRequest = request;
    this.requests.push(request);
    return { receiptId: `receipt_${this.requests.length}` };
  }
}

class CounterFactory implements RunIdFactory {
  private runCounter = 0;
  private activationCounter = 0;

  constructor(
    private readonly makeRunIdValue: () => string,
    private readonly makeActivationIdValue: () => string,
  ) {}

  makeRunId(): string {
    this.runCounter += 1;
    return this.makeRunIdValue();
  }

  makeActivationId(): string {
    this.activationCounter += 1;
    return this.makeActivationIdValue();
  }
}

class InMemoryTriggerSetupStateRepository implements TriggerSetupStateRepository {
  private readonly statesByKey = new Map<string, PersistedTriggerSetupState>();

  async load(trigger: { workflowId: string; nodeId: string }): Promise<PersistedTriggerSetupState | undefined> {
    return this.statesByKey.get(this.toKey(trigger));
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    this.statesByKey.set(this.toKey(state.trigger), state);
  }

  async delete(trigger: { workflowId: string; nodeId: string }): Promise<void> {
    this.statesByKey.delete(this.toKey(trigger));
  }

  private toKey(trigger: { workflowId: string; nodeId: string }): string {
    return `${trigger.workflowId}:${trigger.nodeId}`;
  }
}

function makeCounter(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}

export type EngineTestKitOptions = Partial<{
  container: Container;
  providers: Map<InjectionToken<unknown>, unknown>;
  credentialSessions: CredentialSessionService;
  runStore: WorkflowExecutionRepository;
  scheduler: NodeExecutionScheduler;
  offloadPolicy: NodeOffloadPolicy;
  runDataFactory: RunDataFactory;
  executionContextFactory: ExecutionContextFactory;
  eventBus: RunEventBus;
  triggerSetupStateRepository: TriggerSetupStateRepository;
  webhookBasePath: string;
  makeRunId: () => string;
  makeActivationId: () => string;
  workflowRunner: EngineWorkflowRunnerService;
  /** Passed to {@link EngineFactory} so integration tests can assert host-configured limits propagate. */
  executionLimitsPolicy: EngineExecutionLimitsPolicy;
}>;

export function createEngineTestKit(options: EngineTestKitOptions = {}) {
  return createRegistrarEngineTestKit(options);
}

export type RegistrarEngineTestKitOptions = EngineTestKitOptions & {
  /** Passed to {@link EngineRuntimeRegistrar.register}. */
  registrarOptions?: EngineRuntimeRegistrationOptions;
};

/**
 * Same ports as {@link createEngineTestKit}, but wires the engine through {@link EngineRuntimeRegistrar}
 * so {@link RunIntentService} and {@link CoreTokens.WorkflowRunnerService} resolve like production host tests.
 */
export function createRegistrarEngineTestKit(options: RegistrarEngineTestKitOptions = {}) {
  const runStore = options.runStore ?? new InMemoryWorkflowExecutionRepository();
  const scheduler = options.scheduler ?? new CapturingScheduler();
  const offloadPolicy = options.offloadPolicy ?? new HintOnlyOffloadPolicy();
  const makeRunId = options.makeRunId ?? makeCounter("run_");
  const makeActivationId = options.makeActivationId ?? makeCounter("act_");
  const credentialSessions = options.credentialSessions ?? new RejectingCredentialSessionService();
  const eventBus = options.eventBus ?? new InMemoryRunEventBus();
  const triggerSetupStateRepository = options.triggerSetupStateRepository ?? new InMemoryTriggerSetupStateRepository();
  const liveWorkflowRepository = new InMemoryLiveWorkflowRepository();
  const runDataFactory = options.runDataFactory ?? new InMemoryRunDataFactory();
  const executionContextFactory = options.executionContextFactory ?? new DefaultExecutionContextFactory();
  const container = options.container ?? tsyringeContainer.createChildContainer();
  const dependencyContainer = container as DependencyContainer;
  const nodeResolver = container;
  const nodeExecutor = new NodeExecutor(
    new NodeInstanceFactory(nodeResolver),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  const activationScheduler = new DefaultDrivingScheduler(
    offloadPolicy,
    scheduler,
    new InlineDrivingScheduler(nodeExecutor),
  );

  for (const [token, value] of options.providers ?? new Map()) {
    dependencyContainer.registerInstance(token, value);
  }

  dependencyContainer.registerInstance(CoreTokens.CredentialSessionService, credentialSessions);
  dependencyContainer.registerInstance(CoreTokens.LiveWorkflowRepository, liveWorkflowRepository);
  dependencyContainer.registerInstance(CoreTokens.WorkflowRepository, liveWorkflowRepository);
  dependencyContainer.registerInstance(CoreTokens.NodeResolver, nodeResolver);
  dependencyContainer.registerInstance(CoreTokens.RunIdFactory, new CounterFactory(makeRunId, makeActivationId));
  dependencyContainer.registerInstance(CoreTokens.ActivationIdFactory, new CounterFactory(makeRunId, makeActivationId));
  dependencyContainer.registerInstance(CoreTokens.WebhookBasePath, options.webhookBasePath ?? "/webhooks");
  dependencyContainer.registerInstance(CoreTokens.WorkflowExecutionRepository, runStore);
  dependencyContainer.registerInstance(CoreTokens.TriggerSetupStateRepository, triggerSetupStateRepository);
  dependencyContainer.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
  dependencyContainer.registerInstance(CoreTokens.RunDataFactory, runDataFactory);
  dependencyContainer.registerInstance(CoreTokens.ExecutionContextFactory, executionContextFactory);
  dependencyContainer.registerInstance(CoreTokens.RunEventBus, eventBus);
  dependencyContainer.registerInstance(CoreTokens.PersistedWorkflowTokenRegistry, new PersistedWorkflowTokenRegistry());
  dependencyContainer.registerInstance(
    CoreTokens.WorkflowActivationPolicy,
    new AllWorkflowsActiveWorkflowActivationPolicy(),
  );

  if (options.executionLimitsPolicy !== undefined) {
    dependencyContainer.registerInstance(CoreTokens.EngineExecutionLimitsPolicy, options.executionLimitsPolicy);
  }

  new EngineRuntimeRegistrar().register(dependencyContainer, options.registrarOptions ?? {});

  const engine = dependencyContainer.resolve(Engine);
  const runIntent = dependencyContainer.resolve(RunIntentService);
  const workflowRunner =
    options.workflowRunner ??
    (dependencyContainer.resolve(CoreTokens.WorkflowRunnerService) as EngineWorkflowRunnerService);
  dependencyContainer.registerInstance(
    SubWorkflowRunnerNode,
    new SubWorkflowRunnerNode(workflowRunner as WorkflowRunnerService),
  );

  async function start(workflows: WorkflowDefinition[]): Promise<void> {
    await engine.start(workflows);
  }

  async function runToCompletion(args: {
    wf: WorkflowDefinition;
    startAt: string;
    items: any;
    parent?: any;
  }): Promise<RunResult> {
    const r0 = await engine.runWorkflow(args.wf, args.startAt as any, args.items, args.parent);
    if (r0.status !== "pending") return r0;
    return await engine.waitForCompletion(r0.runId);
  }

  async function runIntentStartToCompletion(args: {
    wf: WorkflowDefinition;
    startAt: string;
    items: any;
    parent?: any;
  }): Promise<RunResult> {
    const r0 = await runIntent.startWorkflow({
      workflow: args.wf,
      startAt: args.startAt,
      items: args.items,
      parent: args.parent,
    });
    if (r0.status !== "pending") return r0;
    return await engine.waitForCompletion(r0.runId);
  }

  return {
    engine,
    runIntent,
    liveWorkflowRepository,
    runStore,
    triggerSetupStateRepository,
    scheduler: scheduler as CapturingScheduler | NodeExecutionScheduler,
    offloadPolicy,
    workflowRunner,
    start,
    runToCompletion,
    runIntentStartToCompletion,
    makeRunId,
    makeActivationId,
  };
}

import type {
  Container,
  CredentialService,
  ExecutionContextFactory,
  NodeActivationObserver,
  NodeExecutionRequest,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
  RunEventBus,
  RunDataFactory,
  RunIdFactory,
  RunResult,
  RunStateStore,
  WebhookRegistrar,
  WorkflowDefinition,
  WorkflowRunnerService,
} from "../../dist/index.js";

import {
  ContainerNodeResolver,
  ContainerWorkflowRunnerResolver,
  CoreTokens,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  Engine,
  EngineWorkflowRunnerService,
  HintOnlyOffloadPolicy,
  InMemoryCredentialService,
  InMemoryRunDataFactory,
  InMemoryRunEventBus,
  InMemoryRunStateStore,
  InMemoryWorkflowRegistry,
  InlineDrivingScheduler,
  PersistedWorkflowTokenRegistry,
} from "../../dist/index.js";
import { container as tsyringeContainer } from "tsyringe";
import type { DependencyContainer, InjectionToken } from "tsyringe";

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

class TestWebhookRegistrar implements WebhookRegistrar {
  registerWebhook(): never {
    throw new Error("not used");
  }
}

class CapturingNodeActivationObserver implements NodeActivationObserver {
  constructor(private readonly activations: Array<unknown>) {}

  onNodeActivation(stats: unknown): void {
    this.activations.push(stats);
  }
}

function makeCounter(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export type EngineTestKitOptions = Partial<{
  container: Container;
  providers: Map<InjectionToken<unknown>, unknown>;
  credentials: CredentialService;
  runStore: RunStateStore;
  scheduler: NodeExecutionScheduler;
  offloadPolicy: NodeOffloadPolicy;
  runDataFactory: RunDataFactory;
  executionContextFactory: ExecutionContextFactory;
  eventBus: RunEventBus;
  webhookBasePath: string;
  makeRunId: () => string;
  makeActivationId: () => string;
  workflowRunner: EngineWorkflowRunnerService;
}>;

export function createEngineTestKit(options: EngineTestKitOptions = {}) {
  const activations: Array<unknown> = [];
  const runStore = options.runStore ?? new InMemoryRunStateStore();
  const scheduler = options.scheduler ?? new CapturingScheduler();
  const offloadPolicy = options.offloadPolicy ?? new HintOnlyOffloadPolicy();
  const makeRunId = options.makeRunId ?? makeCounter("run_");
  const makeActivationId = options.makeActivationId ?? makeCounter("act_");
  const credentials = options.credentials ?? new InMemoryCredentialService();
  const eventBus = options.eventBus ?? new InMemoryRunEventBus();
  const workflowRegistry = new InMemoryWorkflowRegistry();
  const runDataFactory = options.runDataFactory ?? new InMemoryRunDataFactory();
  const executionContextFactory = options.executionContextFactory ?? new DefaultExecutionContextFactory();
  const activationScheduler = new DefaultDrivingScheduler(offloadPolicy, scheduler, new InlineDrivingScheduler());
  const container = options.container ?? tsyringeContainer.createChildContainer();
  const dependencyContainer = container as DependencyContainer;

  for (const [token, value] of options.providers ?? new Map()) {
    dependencyContainer.registerInstance(token, value);
  }

  dependencyContainer.registerInstance(CoreTokens.ServiceContainer, container);
  dependencyContainer.registerInstance(CoreTokens.CredentialService, credentials);
  dependencyContainer.registerInstance(CoreTokens.WorkflowRegistry, workflowRegistry);
  dependencyContainer.registerInstance(CoreTokens.NodeResolver, new ContainerNodeResolver(container));
  dependencyContainer.registerInstance(CoreTokens.WorkflowRunnerResolver, new ContainerWorkflowRunnerResolver(container));
  dependencyContainer.registerInstance(CoreTokens.RunIdFactory, new CounterFactory(makeRunId, makeActivationId));
  dependencyContainer.registerInstance(CoreTokens.ActivationIdFactory, new CounterFactory(makeRunId, makeActivationId));
  dependencyContainer.registerInstance(CoreTokens.WebhookBasePath, options.webhookBasePath ?? "/webhooks");
  dependencyContainer.registerInstance(CoreTokens.RunStateStore, runStore);
  dependencyContainer.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
  dependencyContainer.registerInstance(CoreTokens.RunDataFactory, runDataFactory);
  dependencyContainer.registerInstance(CoreTokens.ExecutionContextFactory, executionContextFactory);
  dependencyContainer.registerInstance(CoreTokens.RunEventBus, eventBus);
  dependencyContainer.registerInstance(CoreTokens.WebhookRegistrar, new TestWebhookRegistrar());
  dependencyContainer.registerInstance(CoreTokens.NodeActivationObserver, new CapturingNodeActivationObserver(activations));

  const tokenRegistry = new PersistedWorkflowTokenRegistry();
  const engine = new Engine({
    credentials,
    workflowRunnerResolver: new ContainerWorkflowRunnerResolver(container),
    workflowRegistry,
    nodeResolver: new ContainerNodeResolver(container),
    webhookRegistrar: new TestWebhookRegistrar(),
    nodeActivationObserver: new CapturingNodeActivationObserver(activations),
    runIdFactory: new CounterFactory(makeRunId, makeActivationId),
    activationIdFactory: new CounterFactory(makeRunId, makeActivationId),
    webhookBasePath: options.webhookBasePath ?? "/webhooks",
    runStore,
    activationScheduler,
    runDataFactory,
    executionContextFactory,
    eventBus,
    tokenRegistry,
  });
  const workflowRunner = options.workflowRunner ?? new EngineWorkflowRunnerService(engine, workflowRegistry);
  dependencyContainer.registerInstance(CoreTokens.WorkflowRunnerService, workflowRunner as WorkflowRunnerService);

  async function start(workflows: WorkflowDefinition[]): Promise<void> {
    workflowRegistry.setWorkflows(workflows);
    await engine.start(workflows);
  }

  async function waitForActivations(count: number, timeoutMs = 1000): Promise<void> {
    const startAtNs = process.hrtime.bigint();
    while (activations.length < count) {
      const elapsedMs = Number(process.hrtime.bigint() - startAtNs) / 1_000_000;
      if (elapsedMs > timeoutMs) throw new Error(`Timed out waiting for activations: expected ${count}, got ${activations.length}`);
      await sleep(0);
    }
  }

  async function runToCompletion(args: { wf: WorkflowDefinition; startAt: string; items: any; parent?: any }): Promise<RunResult> {
    const r0 = await engine.runWorkflow(args.wf, args.startAt as any, args.items, args.parent);
    if (r0.status !== "pending") return r0;
    return await engine.waitForCompletion(r0.runId);
  }

  return {
    engine,
    runStore,
    scheduler: scheduler as CapturingScheduler | NodeExecutionScheduler,
    offloadPolicy,
    activations,
    workflowRunner,
    start,
    waitForActivations,
    runToCompletion,
    makeRunId,
    makeActivationId,
  };
}


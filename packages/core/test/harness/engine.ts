import type {
Container,
CredentialSessionService,
ExecutionContextFactory,
NodeActivationObserver,
NodeExecutionRequest,
NodeExecutionScheduler,
NodeOffloadPolicy,
PersistedTriggerSetupState,
RunDataFactory,
RunEventBus,
RunIdFactory,
RunResult,
RunStateStore,
TriggerSetupStateStore,
WebhookRegistrar,
WorkflowDefinition,
WorkflowRunnerService,
} from "../../src/index.ts";

import type { DependencyContainer,InjectionToken } from "tsyringe";
import { container as tsyringeContainer } from "tsyringe";
import {
ContainerNodeResolver,
ContainerWorkflowRunnerResolver,
CoreTokens,
DefaultDrivingScheduler,
DefaultExecutionContextFactory,
Engine,
EngineWorkflowRunnerService,
HintOnlyOffloadPolicy,
InMemoryRunDataFactory,
InMemoryRunEventBus,
InMemoryRunStateStore,
InMemoryWorkflowRegistry,
InlineDrivingScheduler,
PersistedWorkflowTokenRegistry,
UnavailableCredentialSessionService,
} from "../../src/index.ts";
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

class TestWebhookRegistrar implements WebhookRegistrar {
  registerWebhook(spec: Readonly<{
    workflowId: string;
    nodeId: string;
    endpointKey: string;
    methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
    parseJsonBody?: (body: unknown) => unknown;
    basePath: string;
  }>) {
    const endpointId = `${spec.workflowId}.${spec.nodeId}.${spec.endpointKey}`;
    return {
      endpointId,
      methods: [...spec.methods],
      path: `${spec.basePath}/${endpointId}`,
    };
  }
}

class CapturingNodeActivationObserver implements NodeActivationObserver {
  constructor(private readonly activations: Array<unknown>) {}

  onNodeActivation(stats: unknown): void {
    this.activations.push(stats);
  }
}

class InMemoryTriggerSetupStateStore implements TriggerSetupStateStore {
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export type EngineTestKitOptions = Partial<{
  container: Container;
  providers: Map<InjectionToken<unknown>, unknown>;
  credentialSessions: CredentialSessionService;
  runStore: RunStateStore;
  scheduler: NodeExecutionScheduler;
  offloadPolicy: NodeOffloadPolicy;
  runDataFactory: RunDataFactory;
  executionContextFactory: ExecutionContextFactory;
  eventBus: RunEventBus;
  triggerSetupStateStore: TriggerSetupStateStore;
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
  const credentialSessions = options.credentialSessions ?? new UnavailableCredentialSessionService();
  const eventBus = options.eventBus ?? new InMemoryRunEventBus();
  const triggerSetupStateStore = options.triggerSetupStateStore ?? new InMemoryTriggerSetupStateStore();
  const workflowRegistry = new InMemoryWorkflowRegistry();
  const runDataFactory = options.runDataFactory ?? new InMemoryRunDataFactory();
  const executionContextFactory = options.executionContextFactory ?? new DefaultExecutionContextFactory();
  const container = options.container ?? tsyringeContainer.createChildContainer();
  const dependencyContainer = container as DependencyContainer;
  const nodeResolver = new ContainerNodeResolver(container);
  const workflowRunnerResolver = new ContainerWorkflowRunnerResolver(container);
  const activationScheduler = new DefaultDrivingScheduler(offloadPolicy, scheduler, new InlineDrivingScheduler(nodeResolver));

  for (const [token, value] of options.providers ?? new Map()) {
    dependencyContainer.registerInstance(token, value);
  }

  dependencyContainer.registerInstance(CoreTokens.ServiceContainer, container);
  dependencyContainer.registerInstance(CoreTokens.CredentialSessionService, credentialSessions);
  dependencyContainer.registerInstance(CoreTokens.WorkflowRegistry, workflowRegistry);
  dependencyContainer.registerInstance(CoreTokens.NodeResolver, nodeResolver);
  dependencyContainer.registerInstance(CoreTokens.WorkflowRunnerResolver, workflowRunnerResolver);
  dependencyContainer.registerInstance(CoreTokens.RunIdFactory, new CounterFactory(makeRunId, makeActivationId));
  dependencyContainer.registerInstance(CoreTokens.ActivationIdFactory, new CounterFactory(makeRunId, makeActivationId));
  dependencyContainer.registerInstance(CoreTokens.WebhookBasePath, options.webhookBasePath ?? "/webhooks");
  dependencyContainer.registerInstance(CoreTokens.RunStateStore, runStore);
  dependencyContainer.registerInstance(CoreTokens.TriggerSetupStateStore, triggerSetupStateStore);
  dependencyContainer.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
  dependencyContainer.registerInstance(CoreTokens.RunDataFactory, runDataFactory);
  dependencyContainer.registerInstance(CoreTokens.ExecutionContextFactory, executionContextFactory);
  dependencyContainer.registerInstance(CoreTokens.RunEventBus, eventBus);
  dependencyContainer.registerInstance(CoreTokens.WebhookRegistrar, new TestWebhookRegistrar());
  dependencyContainer.registerInstance(CoreTokens.NodeActivationObserver, new CapturingNodeActivationObserver(activations));

  const tokenRegistry = new PersistedWorkflowTokenRegistry();
  const engine = new Engine({
    credentialSessions,
    workflowRunnerResolver,
    workflowRegistry,
    nodeResolver,
    webhookRegistrar: new TestWebhookRegistrar(),
    nodeActivationObserver: new CapturingNodeActivationObserver(activations),
    runIdFactory: new CounterFactory(makeRunId, makeActivationId),
    activationIdFactory: new CounterFactory(makeRunId, makeActivationId),
    webhookBasePath: options.webhookBasePath ?? "/webhooks",
    runStore,
    triggerSetupStateStore,
    activationScheduler,
    runDataFactory,
    executionContextFactory,
    eventBus,
    tokenRegistry,
  });
  const workflowRunner = options.workflowRunner ?? new EngineWorkflowRunnerService(engine, workflowRegistry);
  dependencyContainer.registerInstance(CoreTokens.WorkflowRunnerService, workflowRunner as WorkflowRunnerService);
  dependencyContainer.registerInstance(SubWorkflowRunnerNode, new SubWorkflowRunnerNode(workflowRunner as WorkflowRunnerService));

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
    triggerSetupStateStore,
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


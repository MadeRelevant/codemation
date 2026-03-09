import "reflect-metadata";

import type { EngineHost, HttpMethod, Items, NodeId, RunEvent, RunEventBus, RunEventSubscription, RunStateStore, WebhookRegistration, WorkflowDefinition, WorkflowId } from "@codemation/core";
import { Engine, EngineWorkflowRunnerService, InlineDrivingScheduler, InMemoryCredentialService, PublishingRunStateStore, SimpleContainerFactory, credentialId } from "@codemation/core";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import { SqliteRunStateStore } from "@codemation/run-store-sqlite";

import { workflows } from "@codemation/test-dev/workflows";

type WebhookHandler = (req: unknown) => Promise<Items>;

class WebhookRegistry {
  private readonly handlersByEndpointId = new Map<string, Readonly<{ method: string; handler: WebhookHandler }>>();

  register(args: { endpointId: string; method: string; handler: WebhookHandler }): void {
    this.handlersByEndpointId.set(args.endpointId, { method: args.method, handler: args.handler });
  }

  get(endpointId: string): Readonly<{ method: string; handler: WebhookHandler }> | undefined {
    return this.handlersByEndpointId.get(endpointId);
  }
}

class NextEngineHost implements EngineHost {
  workflows: any;

  constructor(
    public readonly credentials: InMemoryCredentialService,
    private readonly webhookRegistry: WebhookRegistry,
    private readonly webhookBasePath: string,
  ) {}

  registerWebhook(spec: {
    workflowId: WorkflowId;
    nodeId: NodeId;
    endpointKey: string;
    method: HttpMethod;
    handler: (req: unknown) => Promise<Items>;
    basePath: string;
  }): WebhookRegistration {
    const endpointId = `${spec.workflowId}.${spec.nodeId}.${spec.endpointKey}`;
    const path = `${this.webhookBasePath}/${endpointId}`;
    this.webhookRegistry.register({ endpointId, method: spec.method, handler: spec.handler });
    return { endpointId, method: spec.method, path };
  }

  onNodeActivation(): void {
    // Persisted in RunStateStore; realtime via PublishingRunStateStore + Redis SSE bridge.
  }
}

class NullRunEventBus implements RunEventBus {
  async publish(_event: RunEvent): Promise<void> {}
  async subscribe(_onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    throw new Error("RunEventBus is not configured (missing REDIS_URL)");
  }
}

class IdFactory {
  static makeRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
  static makeActivationId(): string {
    return `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

class HostContext {
  private started = false;
  private readonly workflows: WorkflowDefinition[];
  readonly workflowsById: ReadonlyMap<string, WorkflowDefinition>;

  constructor(
    readonly engine: Engine,
    readonly runStore: RunStateStore,
    readonly eventBus: RunEventBus,
    readonly webhookRegistry: WebhookRegistry,
    workflows: WorkflowDefinition[],
  ) {
    this.workflows = workflows;
    this.workflowsById = new Map(workflows.map((w) => [w.id, w] as const));
  }

  async ensureStarted(): Promise<void> {
    if (this.started) return;
    this.engine.loadWorkflows(this.workflows);
    await this.engine.startTriggers();
    this.started = true;
  }
}

class CodemationHostSingleton {
  private ctxPromise: Promise<HostContext> | undefined;

  async get(): Promise<HostContext> {
    if (!this.ctxPromise) this.ctxPromise = this.create();
    return await this.ctxPromise;
  }

  private async create(): Promise<HostContext> {
    const webhookRegistry = new WebhookRegistry();

    const OPENAI_API_KEY = credentialId<string>("openai.apiKey");
    const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
      const v = process.env.OPENAI_API_KEY;
      if (!v) throw new Error("Missing env var: OPENAI_API_KEY");
      return v;
    });

    const redisUrl = process.env.REDIS_URL;
    const queuePrefix = process.env.QUEUE_PREFIX ?? "codemation";

    const eventBus = redisUrl ? new RedisRunEventBus(redisUrl, queuePrefix) : new NullRunEventBus();
    const dbPath = process.env.CODEMATION_DB_PATH ?? "./.codemation/runs.sqlite";
    const store = new PublishingRunStateStore(new SqliteRunStateStore(dbPath), eventBus);

    const host = new NextEngineHost(credentials, webhookRegistry, "/api/webhooks");

    const configuredWorkflows = workflows as unknown as WorkflowDefinition[];
    const workflowsById = new Map<WorkflowId, WorkflowDefinition>(configuredWorkflows.map((w) => [w.id, w] as const));

    const scheduler = redisUrl ? new BullmqScheduler({ url: redisUrl }, queuePrefix) : undefined;
    const container = SimpleContainerFactory.create();
    const engine =
      redisUrl && scheduler
        ? new Engine(container, host as any, IdFactory.makeRunId as any, IdFactory.makeActivationId as any, "/api/webhooks", store, undefined, scheduler)
        : new Engine(container, host as any, IdFactory.makeRunId as any, IdFactory.makeActivationId as any, "/api/webhooks", store, new InlineDrivingScheduler());

    host.workflows = new EngineWorkflowRunnerService(engine, workflowsById) as any;

    const ctx = new HostContext(engine, store, eventBus, webhookRegistry, configuredWorkflows);
    await ctx.ensureStarted();
    return ctx;
  }
}

export const codemationHost = new CodemationHostSingleton();


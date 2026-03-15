import "reflect-metadata";

import type { Container, CredentialService, RunEventBus, RunStateStore, WorkflowDefinition } from "@codemation/core";
import {
  ConfigDrivenOffloadPolicy,
  container as tsyringeContainer,
  ContainerNodeResolver,
  ContainerWorkflowRunnerResolver,
  CoreTokens,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  Engine,
  EngineWorkflowRunnerService,
  InMemoryCredentialService,
  InMemoryRunDataFactory,
  InMemoryRunEventBus,
  InMemoryRunStateStore,
  InMemoryWorkflowRegistry,
  InlineDrivingScheduler,
  instanceCachingFactory,
  PersistedWorkflowTokenRegistry,
  PublishingRunStateStore,
} from "@codemation/core";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import { ApiPaths } from "./presentation/http/ApiPaths";
import type { CommandBus } from "./application/bus/CommandBus";
import type { DomainEventBus } from "./application/bus/DomainEventBus";
import type { QueryBus } from "./application/bus/QueryBus";
import "./application/commands/HandleWebhookInvocationCommandHandler";
import "./application/commands/ReplayWorkflowNodeCommandHandler";
import "./application/commands/ReplaceMutableRunWorkflowSnapshotCommandHandler";
import "./application/commands/SetPinnedNodeInputCommandHandler";
import "./application/commands/StartWorkflowRunCommandHandler";
import "./application/queries/GetRunStateQueryHandler";
import "./application/queries/GetWorkflowDetailQueryHandler";
import "./application/queries/GetWorkflowSummariesQueryHandler";
import "./application/queries/ListWorkflowRunsQueryHandler";
import { WorkflowRunEventWebsocketRelay } from "./application/websocket/WorkflowRunEventWebsocketRelay";
import "./presentation/http/routeHandlers/RunHttpRouteHandler";
import "./presentation/http/routeHandlers/WebhookHttpRouteHandler";
import "./presentation/http/routeHandlers/WorkflowHttpRouteHandler";
import { ApplicationTokens } from "./applicationTokens";
import type { CodemationBinding } from "./presentation/config/CodemationBinding";
import type { CodemationConfig } from "./presentation/config/CodemationConfig";
import { WorkflowRunRepository } from "./domain/runs/WorkflowRunRepository";
import { WorkflowDefinitionRepository } from "./domain/workflows/WorkflowDefinitionRepository";
import { WebhookEndpointRepository } from "./domain/webhooks/WebhookEndpointRepository";
import { RequestToWebhookItemMapper } from "./infrastructure/webhooks/RequestToWebhookItemMapper";
import { InMemoryCommandBus } from "./infrastructure/di/InMemoryCommandBus";
import { InMemoryDomainEventBus } from "./infrastructure/di/InMemoryDomainEventBus";
import { InMemoryQueryBus } from "./infrastructure/di/InMemoryQueryBus";
import { CodemationIdFactory } from "./infrastructure/ids/CodemationIdFactory";
import { DependencyInjectionHookRunner } from "./infrastructure/config/DependencyInjectionHookRunner";
import { CodemationConfigBindingRegistrar } from "./infrastructure/config/CodemationConfigBindingRegistrar";
import { PrismaClientFactory } from "./infrastructure/persistence/PrismaClientFactory";
import { PrismaMigrationDeployer } from "./infrastructure/persistence/PrismaMigrationDeployer";
import { PrismaWorkflowRunRepository } from "./infrastructure/persistence/PrismaWorkflowRunRepository";
import { WorkflowDefinitionRepositoryAdapter } from "./infrastructure/persistence/WorkflowDefinitionRepositoryAdapter";
import { WorkflowRunRepository as SqlWorkflowRunRepository } from "./infrastructure/persistence/WorkflowRunRepository";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationDatabaseKind,
  CodemationEventBusKind,
  CodemationSchedulerKind,
} from "./presentation/config/CodemationConfig";
import type { WorkerRuntimeScheduler } from "./infrastructure/runtime/WorkerRuntimeScheduler";
import { ServerHttpRouter } from "./presentation/http/ServerHttpRouter";
import { WorkflowWebsocketServer } from "./presentation/websocket/WorkflowWebsocketServer";
import { CodemationServerEngineHost } from "./infrastructure/webhooks/CodemationServerEngineHost";
import { CodemationWebhookRegistry } from "./infrastructure/webhooks/CodemationWebhookRegistry";
import { WebhookEndpointRepositoryAdapter } from "./infrastructure/webhooks/WebhookEndpointRepositoryAdapter";
import { CodemationWorkerHost } from "./infrastructure/worker/CodemationWorkerHost";
import { WorkflowDefinitionMapper } from "./application/mapping/WorkflowDefinitionMapper";
import { PrismaClient } from "./infrastructure/persistence/generated/prisma/client.js";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

export type CodemationStopHandle = StopHandle;

export type CodemationApplicationConfig = CodemationConfig;

export class CodemationApplication {
  private readonly dependencyInjectionHookRunner = new DependencyInjectionHookRunner();
  private readonly configBindingRegistrar = new CodemationConfigBindingRegistrar();

  private container: Container = tsyringeContainer.createChildContainer();
  private workflows: WorkflowDefinition[] = [];
  private credentials: CredentialService = new InMemoryCredentialService();
  private ownedPrismaClient: PrismaClient | null = null;
  private runtimeConfig: CodemationApplicationRuntimeConfig = {};
  private bindings: ReadonlyArray<CodemationBinding<unknown>> = [];

  constructor() {
    this.synchronizeContainerRegistrations();
  }

  useConfig(config: CodemationApplicationConfig): this {
    if (config.workflows) {
      this.useWorkflows(config.workflows);
    }
    if (config.bindings) {
      this.useBindings(config.bindings);
    }
    if (config.credentials) {
      this.useCredentials(config.credentials);
    }
    if (config.runtime) {
      this.useRuntimeConfig(config.runtime);
    }
    return this;
  }

  useContainer(container: Container): this {
    this.container = container;
    this.synchronizeContainerRegistrations();
    return this;
  }

  useWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): this {
    this.workflows = [...workflows];
    this.synchronizeWorkflowRegistry();
    return this;
  }

  useCredentials(credentials: CredentialService): this {
    this.credentials = credentials;
    this.synchronizeContainerRegistrations();
    return this;
  }

  useRuntimeConfig(runtimeConfig: CodemationApplicationRuntimeConfig): this {
    this.runtimeConfig = { ...this.runtimeConfig, ...runtimeConfig };
    return this;
  }

  useBindings(bindings: NonNullable<CodemationConfig["bindings"]>): this {
    this.bindings = [...bindings];
    this.synchronizeContainerRegistrations();
    return this;
  }

  getRuntimeConfig(): CodemationApplicationRuntimeConfig {
    return { ...this.runtimeConfig };
  }

  getContainer(): Container {
    return this.container;
  }

  getWorkflows(): ReadonlyArray<WorkflowDefinition> {
    return [...this.workflows];
  }

  getCredentials(): CredentialService {
    return this.credentials;
  }

  async applyBootHook(args: Readonly<{
    bootHookToken: CodemationConfig["bootHook"];
    consumerRoot: string;
    repoRoot: string;
    env?: Readonly<Record<string, string | undefined>>;
    workflowSources?: ReadonlyArray<string>;
  }>): Promise<void> {
    await this.dependencyInjectionHookRunner.run({
      bootHookToken: args.bootHookToken,
      container: this.container,
      context: {
        application: this,
        container: this.container,
        consumerRoot: args.consumerRoot,
        repoRoot: args.repoRoot,
        env: args.env ?? process.env,
        discoveredWorkflows: this.getWorkflows(),
        workflowSources: args.workflowSources ?? [],
      },
    });
  }

  async prepareFrontendServerContainer(args: Readonly<{
    repoRoot: string;
    env?: Readonly<NodeJS.ProcessEnv>;
  }>): Promise<void> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareImplementationRegistrations(args.repoRoot, effectiveEnv);
    this.container.registerInstance(ApplicationTokens.WebSocketPort, this.resolveWebSocketPort(effectiveEnv));
    this.container.registerInstance(ApplicationTokens.WebSocketBindHost, effectiveEnv.CODEMATION_WS_BIND_HOST ?? "0.0.0.0");
    this.registerServerWebhookRuntimeHost();
    await this.startPresentationServers();
  }

  async startWorkerRuntime(args: Readonly<{
    repoRoot: string;
    env?: Readonly<NodeJS.ProcessEnv>;
    queues: ReadonlyArray<string>;
    bootstrapSource?: string | null;
    workflowSources?: ReadonlyArray<string>;
  }>): Promise<CodemationStopHandle> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareImplementationRegistrations(args.repoRoot, effectiveEnv);
    this.registerWorkerWebhookRuntimeHost();
    if (!this.container.isRegistered(ApplicationTokens.WorkerRuntimeScheduler, true)) {
      throw new Error("Worker mode requires a BullMQ scheduler backed by a Redis event bus.");
    }
    const workflows = this.container.resolve(CoreTokens.WorkflowRegistry).list();
    const engine = this.container.resolve(Engine);
    await engine.start([...workflows]);
    const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow] as const));
    const scheduler = this.container.resolve(ApplicationTokens.WorkerRuntimeScheduler);
    const worker = scheduler.createWorker({
      queues: args.queues,
      workflowsById,
      nodeResolver: this.container.resolve(CoreTokens.NodeResolver),
      credentials: this.container.resolve(CoreTokens.CredentialService),
      runStore: this.container.resolve(CoreTokens.RunStateStore),
      continuation: engine,
      workflows: this.container.resolve(CoreTokens.WorkflowRunnerService),
    });

    void args.bootstrapSource;
    void args.workflowSources;

    return {
      stop: async () => {
        await worker.stop();
        await scheduler.close();
      },
    };
  }

  async stopFrontendServerContainer(): Promise<void> {
    if (this.container.isRegistered(WorkflowRunEventWebsocketRelay, true)) {
      await this.container.resolve(WorkflowRunEventWebsocketRelay).stop();
    }
    if (this.container.isRegistered(WorkflowWebsocketServer, true)) {
      await this.container.resolve(WorkflowWebsocketServer).stop();
    }
    if (this.ownedPrismaClient) {
      await this.ownedPrismaClient.$disconnect();
      this.ownedPrismaClient = null;
    }
  }

  private registerServerWebhookRuntimeHost(): void {
    this.container.registerInstance(CoreTokens.WebhookBasePath, ApiPaths.webhooks());
    this.container.register(CodemationServerEngineHost, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new CodemationServerEngineHost(
          dependencyContainer.resolve(CodemationWebhookRegistry),
          dependencyContainer.resolve(CoreTokens.WebhookBasePath),
        );
      }),
    });
    this.container.register(CoreTokens.WebhookRegistrar, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationServerEngineHost)),
    });
    this.container.register(CoreTokens.NodeActivationObserver, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationServerEngineHost)),
    });
  }

  private registerWorkerWebhookRuntimeHost(): void {
    this.container.registerInstance(CoreTokens.WebhookBasePath, ApiPaths.webhooks());
    this.container.register(CodemationWorkerHost, {
      useFactory: instanceCachingFactory(() => new CodemationWorkerHost()),
    });
    this.container.register(CoreTokens.WebhookRegistrar, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationWorkerHost)),
    });
    this.container.register(CoreTokens.NodeActivationObserver, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationWorkerHost)),
    });
  }

  private synchronizeContainerRegistrations(): void {
    this.registerCoreInfrastructure();
    this.registerRepositoriesAndBuses();
    this.registerApplicationServicesAndRoutes();
    this.registerOperationalInfrastructure();
    this.registerConfiguredBindings();
    this.synchronizeWorkflowRegistry();
  }

  private registerConfiguredBindings(): void {
    if (this.bindings.length === 0) {
      return;
    }
    this.configBindingRegistrar.apply(this.container, this.bindings);
  }

  private registerCoreInfrastructure(): void {
    this.container.registerInstance(CodemationApplication, this);
    this.container.registerInstance(CoreTokens.ServiceContainer, this.container);
    this.container.registerInstance(CoreTokens.PersistedWorkflowTokenRegistry, new PersistedWorkflowTokenRegistry());
    this.container.registerInstance(CoreTokens.CredentialService, this.credentials);
    this.container.register(CodemationIdFactory, { useClass: CodemationIdFactory });
    this.container.register(CoreTokens.RunIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    this.container.register(CoreTokens.ActivationIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    this.container.register(CoreTokens.WorkflowRegistry, {
      useFactory: instanceCachingFactory(() => new InMemoryWorkflowRegistry()),
    });
    this.container.register(CoreTokens.NodeResolver, {
      useFactory: instanceCachingFactory((dependencyContainer) => new ContainerNodeResolver(dependencyContainer.resolve(CoreTokens.ServiceContainer))),
    });
    this.container.register(CoreTokens.WorkflowRunnerResolver, {
      useFactory: instanceCachingFactory((dependencyContainer) => new ContainerWorkflowRunnerResolver(dependencyContainer.resolve(CoreTokens.ServiceContainer))),
    });
    this.container.register(Engine, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new Engine({
          credentials: dependencyContainer.resolve(CoreTokens.CredentialService),
          workflowRunnerResolver: dependencyContainer.resolve(CoreTokens.WorkflowRunnerResolver),
          workflowRegistry: dependencyContainer.resolve(CoreTokens.WorkflowRegistry),
          nodeResolver: dependencyContainer.resolve(CoreTokens.NodeResolver),
          webhookRegistrar: dependencyContainer.resolve(CoreTokens.WebhookRegistrar),
          nodeActivationObserver: dependencyContainer.resolve(CoreTokens.NodeActivationObserver),
          runIdFactory: dependencyContainer.resolve(CoreTokens.RunIdFactory),
          activationIdFactory: dependencyContainer.resolve(CoreTokens.ActivationIdFactory),
          webhookBasePath: dependencyContainer.resolve(CoreTokens.WebhookBasePath),
          runStore: dependencyContainer.resolve(CoreTokens.RunStateStore),
          activationScheduler: dependencyContainer.resolve(CoreTokens.NodeActivationScheduler),
          runDataFactory: dependencyContainer.resolve(CoreTokens.RunDataFactory),
          executionContextFactory: dependencyContainer.resolve(CoreTokens.ExecutionContextFactory),
          eventBus: dependencyContainer.resolve(CoreTokens.RunEventBus),
          tokenRegistry: dependencyContainer.resolve(CoreTokens.PersistedWorkflowTokenRegistry),
        });
      }),
    });
    this.container.register(WorkflowWebsocketServer, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new WorkflowWebsocketServer(
          dependencyContainer.resolve(ApplicationTokens.WebSocketPort),
          dependencyContainer.resolve(ApplicationTokens.WebSocketBindHost),
        );
      }),
    });
    this.container.register(CoreTokens.WorkflowRunnerService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new EngineWorkflowRunnerService(dependencyContainer.resolve(Engine), dependencyContainer.resolve(CoreTokens.WorkflowRegistry));
      }),
    });
    this.container.register(PrismaClientFactory, { useClass: PrismaClientFactory });
    this.container.register(PrismaMigrationDeployer, { useClass: PrismaMigrationDeployer });
    this.container.register(CodemationWebhookRegistry, {
      useFactory: instanceCachingFactory(() => new CodemationWebhookRegistry()),
    });
    this.container.register(WorkflowDefinitionMapper, { useClass: WorkflowDefinitionMapper });
    this.container.register(RequestToWebhookItemMapper, { useClass: RequestToWebhookItemMapper });
  }

  private registerRepositoriesAndBuses(): void {
    this.container.register(WorkflowDefinitionRepositoryAdapter, { useClass: WorkflowDefinitionRepositoryAdapter });
    this.container.register(SqlWorkflowRunRepository, { useClass: SqlWorkflowRunRepository });
    this.container.register(WebhookEndpointRepositoryAdapter, { useClass: WebhookEndpointRepositoryAdapter });
    this.container.register(ApplicationTokens.WorkflowDefinitionRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => dependencyContainer.resolve(WorkflowDefinitionRepositoryAdapter) as unknown as WorkflowDefinitionRepository,
      ),
    });
    this.container.register(ApplicationTokens.WorkflowRunRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => dependencyContainer.resolve(SqlWorkflowRunRepository) as unknown as WorkflowRunRepository,
      ),
    });
    this.container.register(ApplicationTokens.WebhookEndpointRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => dependencyContainer.resolve(WebhookEndpointRepositoryAdapter) as unknown as WebhookEndpointRepository,
      ),
    });
    this.container.register(InMemoryQueryBus, { useClass: InMemoryQueryBus });
    this.container.register(InMemoryCommandBus, { useClass: InMemoryCommandBus });
    this.container.register(InMemoryDomainEventBus, { useClass: InMemoryDomainEventBus });
    this.container.register(ApplicationTokens.QueryBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryQueryBus) as unknown as QueryBus),
    });
    this.container.register(ApplicationTokens.CommandBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryCommandBus) as unknown as CommandBus),
    });
    this.container.register(ApplicationTokens.DomainEventBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryDomainEventBus) as unknown as DomainEventBus),
    });
  }

  private registerApplicationServicesAndRoutes(): void {
    this.container.register(ServerHttpRouter, {
      useClass: ServerHttpRouter,
    });
  }

  private registerOperationalInfrastructure(): void {
    this.container.register(ApplicationTokens.WorkflowWebsocketPublisher, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(WorkflowWebsocketServer)),
    });
    this.container.register(WorkflowRunEventWebsocketRelay, { useClass: WorkflowRunEventWebsocketRelay });
  }

  private synchronizeWorkflowRegistry(): void {
    const workflowRegistry = this.container.resolve(CoreTokens.WorkflowRegistry);
    workflowRegistry.setWorkflows(this.workflows);
  }

  private async prepareImplementationRegistrations(repoRoot: string, env: NodeJS.ProcessEnv): Promise<void> {
    const resolved = this.resolveImplementationSelection({
      repoRoot,
      env,
      runtimeConfig: this.runtimeConfig,
    });
    await this.applyDatabaseMigrations(resolved, env);
    const eventBus = this.createRunEventBus(resolved);
    const persistence = this.createRunPersistence(resolved, eventBus);
    const activationScheduler = this.createNodeActivationScheduler(resolved);

    this.container.registerInstance(CoreTokens.RunEventBus, eventBus);
    this.container.registerInstance(CoreTokens.RunStateStore, persistence.runStore);
    this.container.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
    this.container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
    this.container.registerInstance(CoreTokens.ExecutionContextFactory, new DefaultExecutionContextFactory());
    if (persistence.workflowRunRepository) {
      this.container.registerInstance(ApplicationTokens.WorkflowRunRepository, persistence.workflowRunRepository);
    }
    if (persistence.prismaClient) {
      this.container.registerInstance(PrismaClient, persistence.prismaClient);
    }
    if (resolved.workerRuntimeScheduler) {
      this.container.registerInstance(ApplicationTokens.WorkerRuntimeScheduler, resolved.workerRuntimeScheduler);
    }
    this.synchronizeWorkflowRegistry();
  }

  private async applyDatabaseMigrations(resolved: ResolvedImplementationSelection, env: NodeJS.ProcessEnv): Promise<void> {
    if (!resolved.databaseUrl || this.hasProvidedPrismaClientOverride()) {
      return;
    }
    await this.container.resolve(PrismaMigrationDeployer).deploy({
      databaseUrl: resolved.databaseUrl,
      env,
    });
  }

  private createRunEventBus(resolved: ResolvedImplementationSelection): RunEventBus {
    if (resolved.eventBusKind === "redis") {
      return new RedisRunEventBus(this.requireRedisUrl(resolved.redisUrl), resolved.queuePrefix);
    }
    return new InMemoryRunEventBus();
  }

  private createRunPersistence(
    resolved: ResolvedImplementationSelection,
    eventBus: RunEventBus,
  ): Readonly<{ runStore: RunStateStore; workflowRunRepository?: WorkflowRunRepository; prismaClient?: PrismaClient }> {
    if (!resolved.databaseUrl) {
      return {
        runStore: new PublishingRunStateStore(new InMemoryRunStateStore(), eventBus),
      };
    }
    const prismaClientResolution = this.resolveInjectedOrOwnedPrismaClient(resolved.databaseUrl);
    const childContainer = this.container.createChildContainer();
    childContainer.registerInstance(PrismaClient, prismaClientResolution.prismaClient);
    const workflowRunRepository = childContainer.resolve(PrismaWorkflowRunRepository);
    return {
      prismaClient: prismaClientResolution.ownedPrismaClient,
      workflowRunRepository,
      runStore: new PublishingRunStateStore(workflowRunRepository, eventBus),
    };
  }

  private hasProvidedPrismaClientOverride(): boolean {
    return this.container.isRegistered(PrismaClient, true);
  }

  private resolveInjectedOrOwnedPrismaClient(databaseUrl: string): Readonly<{
    prismaClient: PrismaClient;
    ownedPrismaClient?: PrismaClient;
  }> {
    if (this.hasProvidedPrismaClientOverride()) {
      return {
        prismaClient: this.container.resolve(PrismaClient),
      };
    }
    const prismaClient = this.container.resolve(PrismaClientFactory).create(databaseUrl);
    this.ownedPrismaClient = prismaClient;
    return {
      prismaClient,
      ownedPrismaClient: prismaClient,
    };
  }

  private createNodeActivationScheduler(resolved: ResolvedImplementationSelection) {
    if (resolved.workerRuntimeScheduler) {
      return new DefaultDrivingScheduler(new ConfigDrivenOffloadPolicy(), resolved.workerRuntimeScheduler, new InlineDrivingScheduler());
    }
    return new InlineDrivingScheduler();
  }

  private resolveImplementationSelection(args: Readonly<{
    repoRoot: string;
    runtimeConfig: CodemationApplicationRuntimeConfig;
    env: Readonly<NodeJS.ProcessEnv>;
  }>): ResolvedImplementationSelection {
    void args.repoRoot;
    const databaseUrl = this.resolveDatabaseUrl(args.runtimeConfig, args.env);
    const databaseKind = databaseUrl ? this.resolveDatabaseKind(args.runtimeConfig) : undefined;
    const redisUrl = args.runtimeConfig.eventBus?.redisUrl ?? args.env.REDIS_URL;
    const schedulerKind = this.resolveSchedulerKind(args.runtimeConfig, args.env, redisUrl);
    const eventBusKind = this.resolveEventBusKind(args.runtimeConfig, args.env, schedulerKind, redisUrl);
    const queuePrefix =
      args.runtimeConfig.scheduler?.queuePrefix ?? args.runtimeConfig.eventBus?.queuePrefix ?? args.env.QUEUE_PREFIX ?? "codemation";
    if (schedulerKind === "bullmq" && eventBusKind !== "redis") {
      throw new Error("BullMQ scheduling requires a Redis event bus so worker events can be forwarded to connected clients.");
    }
    if (eventBusKind === "redis" && !redisUrl) {
      throw new Error("Redis event bus requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
    const workerRuntimeScheduler =
      schedulerKind === "bullmq" ? new BullmqScheduler({ url: this.requireRedisUrl(redisUrl) }, queuePrefix) : undefined;
    return {
      databaseUrl,
      databaseKind,
      eventBusKind,
      queuePrefix,
      redisUrl,
      schedulerKind,
      workerRuntimeScheduler,
    };
  }

  private resolveSchedulerKind(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
    redisUrl: string | undefined,
  ): CodemationSchedulerKind {
    const configuredKind = runtimeConfig.scheduler?.kind ?? this.readSchedulerKind(env.CODEMATION_SCHEDULER);
    if (configuredKind) return configuredKind;
    return redisUrl ? "bullmq" : "local";
  }

  private resolveEventBusKind(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
    schedulerKind: CodemationSchedulerKind,
    redisUrl: string | undefined,
  ): CodemationEventBusKind {
    const configuredKind = runtimeConfig.eventBus?.kind ?? this.readEventBusKind(env.CODEMATION_EVENT_BUS);
    if (configuredKind) return configuredKind;
    if (schedulerKind === "bullmq") return "redis";
    return redisUrl ? "redis" : "memory";
  }

  private resolveDatabaseKind(runtimeConfig: CodemationApplicationRuntimeConfig): CodemationDatabaseKind {
    return runtimeConfig.database?.kind ?? "postgresql";
  }

  private resolveDatabaseUrl(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
  ): string | undefined {
    const configuredUrl = runtimeConfig.database?.url ?? env.DATABASE_URL;
    if (!configuredUrl) {
      if (runtimeConfig.database) {
        throw new Error("Database configuration requires runtime.database.url or DATABASE_URL.");
      }
      return undefined;
    }
    if (!this.isPostgresUrl(configuredUrl)) {
      throw new Error(`Unsupported DATABASE_URL protocol for PostgreSQL runtime persistence: ${configuredUrl}`);
    }
    return configuredUrl;
  }

  private readSchedulerKind(value: string | undefined): CodemationSchedulerKind | undefined {
    if (value === "local" || value === "bullmq") return value;
    return undefined;
  }

  private readEventBusKind(value: string | undefined): CodemationEventBusKind | undefined {
    if (value === "memory" || value === "redis") return value;
    return undefined;
  }

  private requireRedisUrl(redisUrl: string | undefined): string {
    if (!redisUrl) throw new Error("Redis-backed runtime requires runtime.eventBus.redisUrl or REDIS_URL.");
    return redisUrl;
  }

  private isPostgresUrl(databaseUrl: string): boolean {
    return databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");
  }

  private resolveWebSocketPort(env: Readonly<NodeJS.ProcessEnv>): number {
    const rawPort = env.CODEMATION_WS_PORT ?? env.VITE_CODEMATION_WS_PORT;
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) return parsedPort;
    return 3001;
  }

  private async startPresentationServers(): Promise<void> {
    await this.container.resolve(WorkflowWebsocketServer).start();
    await this.container.resolve(WorkflowRunEventWebsocketRelay).start();
  }
}

type ResolvedImplementationSelection = Readonly<{
  databaseUrl?: string;
  databaseKind?: CodemationDatabaseKind;
  eventBusKind: CodemationEventBusKind;
  queuePrefix: string;
  redisUrl?: string;
  schedulerKind: CodemationSchedulerKind;
  workerRuntimeScheduler?: WorkerRuntimeScheduler;
}>;


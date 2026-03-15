import "reflect-metadata";

import type { Container, CredentialService, WorkflowDefinition } from "@codemation/core";
import {
  container as tsyringeContainer,
  ContainerNodeResolver,
  ContainerWorkflowRunnerResolver,
  CoreTokens,
  Engine,
  EngineWorkflowRunnerService,
  InMemoryCredentialService,
  InMemoryWorkflowRegistry,
  instanceCachingFactory,
  PersistedWorkflowTokenRegistry,
} from "@codemation/core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
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
import { WorkflowDefinitionRepositoryAdapter } from "./infrastructure/persistence/WorkflowDefinitionRepositoryAdapter";
import { WorkflowRunRepository as SqlWorkflowRunRepository } from "./infrastructure/persistence/WorkflowRunRepository";
import { CodemationWorkerRuntimeRoot } from "./infrastructure/runtime/CodemationWorkerRuntimeRoot";
import type { CodemationApplicationRuntimeConfig } from "./infrastructure/runtime/CodemationRuntimeConfig";
import { RealtimeRuntimeFactory } from "./realtimeRuntimeFactory";
import { ServerHttpRouter } from "./presentation/http/ServerHttpRouter";
import { WorkflowWebsocketServer } from "./presentation/websocket/WorkflowWebsocketServer";
import { CodemationServerEngineHost } from "./infrastructure/webhooks/CodemationServerEngineHost";
import { CodemationWebhookRegistry } from "./infrastructure/webhooks/CodemationWebhookRegistry";
import { WebhookEndpointRepositoryAdapter } from "./infrastructure/webhooks/WebhookEndpointRepositoryAdapter";
import { CodemationWorkerHost } from "./infrastructure/worker/CodemationWorkerHost";
import { WorkflowDefinitionMapper } from "./application/mapping/WorkflowDefinitionMapper";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

export type CodemationStopHandle = StopHandle;

export type CodemationApplicationConfig = CodemationConfig;

export class CodemationApplication {
  private readonly dependencyInjectionHookRunner = new DependencyInjectionHookRunner();
  private readonly configBindingRegistrar = new CodemationConfigBindingRegistrar();

  private container: Container = tsyringeContainer.createChildContainer();
  private workflows: WorkflowDefinition[] = [];
  private credentials: CredentialService = new InMemoryCredentialService();
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

  resolveRealtimeModeForEnvironment(env?: Readonly<NodeJS.ProcessEnv>): "memory" | "redis" {
    return this.resolveRealtimeMode({ ...process.env, ...(env ?? {}) });
  }

  async prepareFrontendServerContainer(args: Readonly<{
    repoRoot: string;
    env?: Readonly<NodeJS.ProcessEnv>;
  }>): Promise<void> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareRuntimeRegistrations(args.repoRoot, effectiveEnv);
    this.container.registerInstance(ApplicationTokens.WebSocketPort, this.resolveWebSocketPort(effectiveEnv));
    this.container.registerInstance(ApplicationTokens.WebSocketBindHost, effectiveEnv.CODEMATION_WS_BIND_HOST ?? "0.0.0.0");
    this.registerServerWebhookRuntimeHost();
    await this.startPresentationServers();
  }

  async createWorkerRuntimeRoot(args: Readonly<{ repoRoot: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<CodemationWorkerRuntimeRoot> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareRuntimeRegistrations(args.repoRoot, effectiveEnv);
    this.registerWorkerWebhookRuntimeHost();
    if (!this.container.isRegistered(ApplicationTokens.WorkerRuntimeScheduler, true)) {
      throw new Error("Worker mode requires a BullMQ scheduler backed by a Redis event bus.");
    }
    return this.container.resolve(CodemationWorkerRuntimeRoot);
  }

  async stopFrontendServerContainer(): Promise<void> {
    if (this.container.isRegistered(WorkflowRunEventWebsocketRelay, true)) {
      await this.container.resolve(WorkflowRunEventWebsocketRelay).stop();
    }
    if (this.container.isRegistered(WorkflowWebsocketServer, true)) {
      await this.container.resolve(WorkflowWebsocketServer).stop();
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

  private static parseQueues(rawQueues: string): ReadonlyArray<string> {
    return rawQueues
      .split(",")
      .map((queue) => queue.trim())
      .filter(Boolean);
  }

  private resolveRealtimeMode(effectiveEnv: NodeJS.ProcessEnv): "memory" | "redis" {
    return this.resolveRealtimeRuntimeFactory().resolveMode({
      runtimeConfig: this.runtimeConfig,
      env: effectiveEnv,
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
    this.container.register(RealtimeRuntimeFactory, { useClass: RealtimeRuntimeFactory });
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
    this.container.register(CodemationWorkerRuntimeRoot, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new CodemationWorkerRuntimeRoot(
          dependencyContainer.resolve(Engine),
          dependencyContainer.resolve(ApplicationTokens.WorkerRuntimeScheduler),
          dependencyContainer.resolve(CoreTokens.WorkflowRegistry),
          dependencyContainer.resolve(CoreTokens.WorkflowRunnerService),
          dependencyContainer.resolve(CoreTokens.NodeResolver),
          dependencyContainer.resolve(CoreTokens.CredentialService),
          dependencyContainer.resolve(CoreTokens.RunStateStore),
          dependencyContainer.resolve(ApplicationTokens.RealtimeRuntimeDiagnostics),
        );
      }),
    });
  }

  private synchronizeWorkflowRegistry(): void {
    const workflowRegistry = this.container.resolve(CoreTokens.WorkflowRegistry);
    workflowRegistry.setWorkflows(this.workflows);
  }

  private resolveRealtimeRuntimeFactory(): RealtimeRuntimeFactory {
    return this.container.resolve(RealtimeRuntimeFactory);
  }

  private async prepareRuntimeRegistrations(repoRoot: string, env: NodeJS.ProcessEnv): Promise<void> {
    const runtimeDiagnostics = this.resolveRealtimeRuntimeFactory().describe({
      repoRoot,
      runtimeConfig: this.runtimeConfig,
      env,
    });
    await mkdir(path.dirname(runtimeDiagnostics.dbPath), { recursive: true });
    this.resolveRealtimeRuntimeFactory().register({
      container: this.container,
      repoRoot,
      runtimeConfig: this.runtimeConfig,
      env,
    });
    this.synchronizeWorkflowRegistry();
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


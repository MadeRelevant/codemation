import "reflect-metadata";

import type { Container, CredentialService, WorkflowDefinition, WorkflowRegistry } from "@codemation/core";
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
} from "@codemation/core";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ApplicationTokens } from "./applicationTokens";
import { CodemationBootstrapDiscovery } from "./bootstrapDiscovery";
import type { CodemationBootstrapResult, CodemationDiscoveredApplicationSetup, CodemationGeneratedConsumerModule } from "./bootstrapDiscovery";
import { CodemationServerEngineHost } from "./host/codemationServerEngineHost";
import { CodemationWebhookRegistry } from "./host/codemationWebhookRegistry";
import { CodemationWorkflowDtoMapper } from "./host/codemationWorkflowDtoMapper";
import { RealtimeRuntimeFactory } from "./realtimeRuntimeFactory";
import { CodemationPreparedExecutionRuntimeProvider } from "./frontend/CodemationPreparedExecutionRuntimeProvider";
import { FrontendRouteTokens } from "./frontend/frontendRouteTokens";
import { RequestToWebhookItemMapper } from "./frontend/RequestToWebhookItemMapper";
import { WebhookRouteHandler } from "./frontend/WebhookRouteHandler";
import { CodemationFrontendRuntimeRoot } from "./runtime/codemationFrontendRuntimeRoot";
import { CodemationRuntimeTrackedPaths } from "./runtime/codemationRuntimeTrackedPaths";
import { CodemationRealtimeSocketServer } from "./runtime/codemationRealtimeSocketServer";
import { CodemationWorkerRuntimeRoot } from "./runtime/codemationWorkerRuntimeRoot";
import type { CodemationApplicationRuntimeConfig } from "./runtime/codemationRuntimeConfig";
import { CodemationIdFactory } from "./shared/codemationIdFactory";
import { CodemationStartupSummaryReporter, ConsoleStartupSummaryLogger } from "./startupSummary";
import { CodemationWorkerHost } from "./worker/codemationWorkerHost";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

export type CodemationStopHandle = StopHandle;

export interface CodemationApplicationConfig {
  readonly container?: Container;
  readonly workflows: ReadonlyArray<WorkflowDefinition>;
  readonly credentials: CredentialService;
  readonly runtime?: CodemationApplicationRuntimeConfig;
}

export class CodemationApplication {
  private container: Container = tsyringeContainer.createChildContainer();
  private workflows: WorkflowDefinition[] = [];
  private credentials: CredentialService = new InMemoryCredentialService();
  private runtimeConfig: CodemationApplicationRuntimeConfig = {};

  constructor() {
    this.synchronizeContainerRegistrations();
  }

  useConfig(config: CodemationApplicationConfig): this {
    if (config.container) this.useContainer(config.container);
    this.useWorkflows(config.workflows);
    this.useCredentials(config.credentials);
    if (config.runtime) this.useRuntimeConfig(config.runtime);
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

  resolveRealtimeModeForEnvironment(env?: Readonly<NodeJS.ProcessEnv>): "memory" | "redis" {
    return this.resolveRealtimeMode({ ...process.env, ...(env ?? {}) });
  }

  static async loadDiscoveredApplication(args: Readonly<{
    repoRoot: string;
    consumerRoot: string;
    env?: Record<string, string>;
    configOverride?: CodemationBootstrapResult;
    generatedConsumerModule?: CodemationGeneratedConsumerModule;
    bootstrapPathOverride?: string;
    workflowsDirectoryOverride?: string;
  }>): Promise<CodemationDiscoveredApplicationSetup> {
    const discovery = new CodemationBootstrapDiscovery();
    const application = new CodemationApplication();
    return await discovery.discover({
      application,
      repoRoot: args.repoRoot,
      consumerRoot: args.consumerRoot,
      env: args.env,
      configOverride: args.configOverride,
      generatedConsumerModule: args.generatedConsumerModule,
      bootstrapPathOverride: args.bootstrapPathOverride,
      workflowsDirectoryOverride: args.workflowsDirectoryOverride,
    });
  }

  static async startDiscoveredWorkerMode(args: Readonly<{
    repoRoot: string;
    consumerRoot: string;
    env?: Record<string, string>;
    bootstrapPathOverride?: string;
    workflowsDirectoryOverride?: string;
  }>): Promise<StopHandle> {
    const setup = await this.loadDiscoveredApplication(args);
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    const workerQueues = setup.application.runtimeConfig.scheduler?.workerQueues ?? CodemationApplication.parseQueues(effectiveEnv.WORKER_QUEUES ?? "default");
    const workerRoot = await setup.application.createWorkerRuntimeRoot({
      repoRoot: args.repoRoot,
      env: effectiveEnv,
    });
    return await workerRoot.start({
      queues: workerQueues,
      bootstrapSource: setup.bootstrapSource,
      workflowSources: setup.workflowSources,
    });
  }

  async createFrontendRuntimeRoot(args: Readonly<{ repoRoot: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<CodemationFrontendRuntimeRoot> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareRuntimeRegistrations(args.repoRoot, effectiveEnv);
    this.container.registerInstance(ApplicationTokens.WebSocketPort, this.resolveWebSocketPort(effectiveEnv));
    this.container.registerInstance(ApplicationTokens.WebSocketBindHost, effectiveEnv.CODEMATION_WS_BIND_HOST ?? "0.0.0.0");
    this.container.registerInstance(ApplicationTokens.RealtimeWatchRoots, this.resolveRealtimeWatchRoots(args.repoRoot, effectiveEnv));
    this.container.registerInstance(CoreTokens.WebhookBasePath, "/api/webhooks");
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
    const frontendRoot = this.container.resolve(CodemationFrontendRuntimeRoot);
    await frontendRoot.start();
    return frontendRoot;
  }

  async prepareRuntimeContainer(args: Readonly<{ repoRoot: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<void> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareRuntimeRegistrations(args.repoRoot, effectiveEnv);
  }

  async prepareExecutionRuntimeContainer(args: Readonly<{ repoRoot: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<void> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareRuntimeRegistrations(args.repoRoot, effectiveEnv);
    this.container.registerInstance(CoreTokens.WebhookBasePath, "/api/webhooks");
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

  async createWorkerRuntimeRoot(args: Readonly<{ repoRoot: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<CodemationWorkerRuntimeRoot> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareRuntimeRegistrations(args.repoRoot, effectiveEnv);
    this.container.registerInstance(CoreTokens.WebhookBasePath, "/api/webhooks");
    this.container.register(CodemationWorkerHost, {
      useFactory: instanceCachingFactory(() => new CodemationWorkerHost()),
    });
    this.container.register(CoreTokens.WebhookRegistrar, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationWorkerHost)),
    });
    this.container.register(CoreTokens.NodeActivationObserver, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationWorkerHost)),
    });
    if (!this.container.isRegistered(BullmqScheduler, true)) {
      throw new Error("Worker mode requires a BullMQ scheduler backed by a Redis event bus.");
    }
    return this.container.resolve(CodemationWorkerRuntimeRoot);
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
    this.container.registerInstance(CodemationApplication, this);
    this.container.registerInstance(CoreTokens.ServiceContainer, this.container);
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
        });
      }),
    });
    this.container.register(CodemationRealtimeSocketServer, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new CodemationRealtimeSocketServer(
          dependencyContainer.resolve(CoreTokens.RunEventBus),
          dependencyContainer.resolve(ApplicationTokens.WebSocketPort),
          dependencyContainer.resolve(ApplicationTokens.WebSocketBindHost),
          dependencyContainer.resolve(ApplicationTokens.RealtimeWatchRoots),
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
    this.container.register(CodemationWorkflowDtoMapper, { useClass: CodemationWorkflowDtoMapper });
    this.container.register(CodemationPreparedExecutionRuntimeProvider, { useClass: CodemationPreparedExecutionRuntimeProvider });
    this.container.register(FrontendRouteTokens.PreparedExecutionRuntimeProvider, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationPreparedExecutionRuntimeProvider)),
    });
    this.container.register(RequestToWebhookItemMapper, { useClass: RequestToWebhookItemMapper });
    this.container.register(WebhookRouteHandler, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new WebhookRouteHandler(
          dependencyContainer.resolve(FrontendRouteTokens.PreparedExecutionRuntimeProvider),
          dependencyContainer.resolve(RequestToWebhookItemMapper),
        );
      }),
    });
    this.container.register(ConsoleStartupSummaryLogger, { useClass: ConsoleStartupSummaryLogger });
    this.container.register(CodemationStartupSummaryReporter, { useClass: CodemationStartupSummaryReporter });
    this.container.register(CodemationFrontendRuntimeRoot, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new CodemationFrontendRuntimeRoot(
          dependencyContainer.resolve(Engine),
          dependencyContainer.resolve(CoreTokens.WorkflowRegistry),
          dependencyContainer.resolve(CoreTokens.WorkflowRunnerService),
          dependencyContainer.resolve(CoreTokens.RunStateStore),
          dependencyContainer.resolve(CoreTokens.RunEventBus),
          dependencyContainer.resolve(CodemationRealtimeSocketServer),
          dependencyContainer.resolve(CodemationWebhookRegistry),
          dependencyContainer.resolve(CodemationWorkflowDtoMapper),
          dependencyContainer.resolve(ApplicationTokens.RealtimeRuntimeDiagnostics),
        );
      }),
    });
    this.container.register(CodemationWorkerRuntimeRoot, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new CodemationWorkerRuntimeRoot(
          dependencyContainer.resolve(Engine),
          dependencyContainer.resolve(BullmqScheduler),
          dependencyContainer.resolve(CodemationStartupSummaryReporter),
          dependencyContainer.resolve(CoreTokens.WorkflowRegistry),
          dependencyContainer.resolve(CoreTokens.WorkflowRunnerService),
          dependencyContainer.resolve(CoreTokens.NodeResolver),
          dependencyContainer.resolve(CoreTokens.CredentialService),
          dependencyContainer.resolve(CoreTokens.RunStateStore),
          dependencyContainer.resolve(ApplicationTokens.RealtimeRuntimeDiagnostics),
        );
      }),
    });
    this.synchronizeWorkflowRegistry();
  }

  private synchronizeWorkflowRegistry(): void {
    const workflowRegistry = this.container.resolve<WorkflowRegistry>(CoreTokens.WorkflowRegistry);
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
    const rawPort = env.CODEMATION_WS_PORT ?? env.NEXT_PUBLIC_CODEMATION_WS_PORT;
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) return parsedPort;
    return 3001;
  }

  private resolveRealtimeWatchRoots(repoRoot: string, env: Readonly<NodeJS.ProcessEnv>): ReadonlyArray<string> {
    const consumerRoot = env.CODEMATION_CONSUMER_ROOT ?? process.cwd();
    return CodemationRuntimeTrackedPaths.getAll({ consumerRoot, repoRoot });
  }
}


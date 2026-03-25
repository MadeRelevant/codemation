import path from "node:path";
import "reflect-metadata";

import type {
  Container,
  RunEventBus,
  RunStateStore,
  TriggerSetupStateStore,
  WorkflowDefinition,
} from "@codemation/core";
import {
  ConfigDrivenOffloadPolicy,
  ContainerNodeResolver,
  ContainerWorkflowRunnerResolver,
  CoreTokens,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  Engine,
  EngineExecutionLimitsPolicyFactory,
  EngineFactory,
  EngineWorkflowRunnerService,
  InlineDrivingScheduler,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
  InMemoryRunEventBus,
  WorkflowCatalogWebhookTriggerMatcher,
  instanceCachingFactory,
  NodeInstanceFactory,
  PersistedWorkflowTokenRegistry,
  PublishingRunStateStore,
  RootExecutionOptionsFactory,
  RunIntentService,
  SystemClock,
  container as tsyringeContainer,
  UnavailableCredentialSessionService,
} from "@codemation/core";
import { AIAgentConnectionWorkflowExpander, ConnectionCredentialNodeConfigFactory } from "@codemation/core-nodes";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import type { CommandBus } from "./application/bus/CommandBus";
import type { DomainEventBus } from "./application/bus/DomainEventBus";
import type { QueryBus } from "./application/bus/QueryBus";
import "./application/commands/CopyRunToWorkflowDebuggerCommandHandler";
import "./application/commands/CredentialCommandHandlers";
import "./application/commands/HandleWebhookInvocationCommandHandler";
import "./application/commands/ReplaceMutableRunWorkflowSnapshotCommandHandler";
import "./application/commands/ReplaceWorkflowDebuggerOverlayCommandHandler";
import "./application/commands/UploadOverlayPinnedBinaryCommandHandler";
import "./application/commands/ReplayWorkflowNodeCommandHandler";
import "./application/commands/SetPinnedNodeInputCommandHandler";
import "./application/commands/StartWorkflowRunCommandHandler";
import "./application/commands/UserAccountCommandHandlers";
import { WorkflowDefinitionMapper } from "./application/mapping/WorkflowDefinitionMapper";
import { WebhookEndpointPathValidator } from "./application/workflows/WebhookEndpointPathValidator";
import { WorkflowPolicyUiPresentationFactory } from "./application/mapping/WorkflowPolicyUiPresentationFactory";
import "./application/queries/CredentialQueryHandlers";
import "./application/queries/GetRunBinaryAttachmentQueryHandler";
import "./application/queries/GetRunStateQueryHandler";
import "./application/queries/GetWorkflowOverlayBinaryAttachmentQueryHandler";
import "./application/queries/GetWorkflowDebuggerOverlayQueryHandler";
import "./application/queries/GetWorkflowDetailQueryHandler";
import "./application/queries/GetWorkflowSummariesQueryHandler";
import "./application/queries/ListWorkflowRunsQueryHandler";
import "./application/queries/UserAccountQueryHandlers";
import { WorkflowRunEventWebsocketRelay } from "./application/websocket/WorkflowRunEventWebsocketRelay";
import { ApplicationTokens } from "./applicationTokens";
import { WorkflowCredentialNodeResolver } from "./domain/credentials/WorkflowCredentialNodeResolver";
import {
  CredentialBindingService,
  CredentialInstanceService,
  CredentialFieldEnvOverlayService,
  CredentialMaterialResolver,
  CredentialRuntimeMaterialService,
  CredentialSecretCipher,
  CredentialSessionServiceImpl,
  CredentialTestService,
  CredentialTypeRegistryImpl,
  type RegisteredCredentialType,
} from "./domain/credentials/CredentialServices";
import { OAuth2ConnectService } from "./domain/credentials/OAuth2ConnectServiceFactory";
import { OAuth2ProviderRegistry } from "./domain/credentials/OAuth2ProviderRegistry";
import { WorkflowRunRepository } from "./domain/runs/WorkflowRunRepository";
import { UserAccountService } from "./domain/users/UserAccountServiceRegistry";
import { WorkflowDebuggerOverlayRepository } from "./domain/workflows/WorkflowDebuggerOverlayRepository";
import { WorkflowDefinitionRepository } from "./domain/workflows/WorkflowDefinitionRepository";
import { AuthJsSessionVerifier } from "./infrastructure/auth/AuthJsSessionVerifier";
import { DevelopmentSessionBypassVerifier } from "./infrastructure/auth/DevelopmentSessionBypassVerifier";
import { LocalFilesystemBinaryStorage } from "./infrastructure/binary/LocalFilesystemBinaryStorageRegistry";
import { FrameworkBuiltinCredentialTypesRegistrar } from "./infrastructure/credentials/FrameworkBuiltinCredentialTypesRegistrar";
import { OpenAiApiKeyCredentialHealthTester } from "./infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
import { OpenAiApiKeyCredentialTypeFactory } from "./infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";
import { CodemationConfigBindingRegistrar } from "./infrastructure/config/CodemationConfigBindingRegistrar";
import { CodemationPluginRegistrar } from "./infrastructure/config/CodemationPluginRegistrar";
import { DependencyInjectionHookRunner } from "./infrastructure/config/DependencyInjectionHookRunner";
import { InMemoryCommandBus } from "./infrastructure/di/InMemoryCommandBus";
import { InMemoryDomainEventBus } from "./infrastructure/di/InMemoryDomainEventBus";
import { InMemoryQueryBus } from "./infrastructure/di/InMemoryQueryBus";
import { CodemationIdFactory } from "./infrastructure/ids/CodemationIdFactory";
import { LogLevelPolicyFactory, logLevelPolicyFactory } from "./infrastructure/logging/LogLevelPolicyFactory";
import { ServerLoggerFactory } from "./infrastructure/logging/ServerLoggerFactory";
import {
  InMemoryCredentialStore,
  PrismaCredentialStore,
} from "./infrastructure/persistence/CredentialPersistenceStore";
import { PrismaClient } from "./infrastructure/persistence/generated/prisma-client/client.js";
import { InMemoryTriggerSetupStateStore } from "./infrastructure/persistence/InMemoryTriggerSetupStateStore";
import { InMemoryWorkflowDebuggerOverlayRepository } from "./infrastructure/persistence/InMemoryWorkflowDebuggerOverlayRepository";
import { InMemoryWorkflowRunRepository } from "./infrastructure/persistence/InMemoryWorkflowRunRepository";
import { PrismaClientFactory } from "./infrastructure/persistence/PrismaClientFactory";
import { PrismaMigrationDeployer } from "./infrastructure/persistence/PrismaMigrationDeployer";
import { PrismaTriggerSetupStateStore } from "./infrastructure/persistence/PrismaTriggerSetupStateStore";
import { PrismaWorkflowDebuggerOverlayRepository } from "./infrastructure/persistence/PrismaWorkflowDebuggerOverlayRepository";
import { PrismaWorkflowRunRepository } from "./infrastructure/persistence/PrismaWorkflowRunRepository";
import { WorkflowDefinitionRepositoryAdapter } from "./infrastructure/persistence/WorkflowDefinitionRepositoryAdapter";
import { LiveWorkflowCatalog } from "./infrastructure/runtime/LiveWorkflowCatalog";
import { WorkflowRunRepository as SqlWorkflowRunRepository } from "./infrastructure/persistence/WorkflowRunRepository";
import type { WorkerRuntimeScheduler } from "./infrastructure/runtime/WorkerRuntimeScheduler";
import { RequestToWebhookItemMapper } from "./infrastructure/webhooks/RequestToWebhookItemMapper";
import type { CodemationAuthConfig } from "./presentation/config/CodemationAuthConfig";
import type { CodemationBinding } from "./presentation/config/CodemationBinding";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationConfig,
  CodemationDatabaseKind,
  CodemationEventBusKind,
  CodemationSchedulerKind,
} from "./presentation/config/CodemationConfig";
import type { CodemationPlugin } from "./presentation/config/CodemationPlugin";
import { ApiPaths } from "./presentation/http/ApiPaths";
import { CodemationHonoApiApp } from "./presentation/http/hono/CodemationHonoApiAppFactory";
import "./presentation/http/hono/registrars/BinaryHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/CredentialHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/OAuth2HonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/RunHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/UserHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/WebhookHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/WorkflowHonoApiRouteRegistrar";
import "./application/binary/OverlayPinnedBinaryUploadService";
import "./presentation/http/routeHandlers/BinaryHttpRouteHandlerFactory";
import "./presentation/http/routeHandlers/CredentialHttpRouteHandler";
import "./presentation/http/routeHandlers/OAuth2HttpRouteHandlerFactory";
import "./presentation/http/routeHandlers/RunHttpRouteHandler";
import "./presentation/http/routeHandlers/UserHttpRouteHandlerFactory";
import "./presentation/http/routeHandlers/WebhookHttpRouteHandler";
import "./presentation/http/routeHandlers/WorkflowHttpRouteHandler";
import { WorkflowWebsocketServer } from "./presentation/websocket/WorkflowWebsocketServer";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

export type CodemationStopHandle = StopHandle;

export type CodemationApplicationConfig = CodemationConfig;

export class CodemationApplication {
  private readonly dependencyInjectionHookRunner = new DependencyInjectionHookRunner();
  private readonly configBindingRegistrar = new CodemationConfigBindingRegistrar();
  private readonly pluginRegistrar = new CodemationPluginRegistrar();

  private container: Container = tsyringeContainer.createChildContainer();
  private workflows: WorkflowDefinition[] = [];
  private ownedPrismaClient: PrismaClient | null = null;
  private runtimeConfig: CodemationApplicationRuntimeConfig = {};
  private bindings: ReadonlyArray<CodemationBinding<unknown>> = [];
  private hasConfigCredentialSessionServiceBinding = false;
  private plugins: ReadonlyArray<CodemationPlugin> = [];
  private sharedWorkflowWebsocketServer: WorkflowWebsocketServer | null = null;
  private applicationAuthConfig: CodemationAuthConfig | undefined;
  private frameworkBuiltinCredentialTypesRegistered = false;

  constructor() {
    this.synchronizeContainerRegistrations();
  }

  useConfig(config: CodemationApplicationConfig): this {
    // Credential registration must follow bindings: useBindings() re-syncs the container and replaces CredentialTypeRegistryImpl.
    if (config.workflows) {
      this.useWorkflows(config.workflows);
    }
    if (config.bindings) {
      this.useBindings(config.bindings);
    }
    if (!this.frameworkBuiltinCredentialTypesRegistered) {
      new FrameworkBuiltinCredentialTypesRegistrar(
        new OpenAiApiKeyCredentialTypeFactory(new OpenAiApiKeyCredentialHealthTester(globalThis.fetch)),
      ).register(this, config);
      this.frameworkBuiltinCredentialTypesRegistered = true;
    }
    if (config.credentialTypes) {
      for (const credentialType of config.credentialTypes) {
        this.registerCredentialType(credentialType);
      }
    }
    if (config.plugins) {
      this.usePlugins(config.plugins);
    }
    if (config.runtime) {
      this.useRuntimeConfig(config.runtime);
    }
    if (config.auth !== undefined) {
      this.applicationAuthConfig = config.auth;
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

  useRuntimeConfig(runtimeConfig: CodemationApplicationRuntimeConfig): this {
    this.runtimeConfig = {
      ...this.runtimeConfig,
      ...runtimeConfig,
      ...(runtimeConfig.engineExecutionLimits !== undefined
        ? {
            engineExecutionLimits: {
              ...this.runtimeConfig.engineExecutionLimits,
              ...runtimeConfig.engineExecutionLimits,
            },
          }
        : {}),
    };
    return this;
  }

  useBindings(bindings: NonNullable<CodemationConfig["bindings"]>): this {
    this.bindings = [...bindings];
    this.hasConfigCredentialSessionServiceBinding = bindings.some(
      (entry) => entry.token === CoreTokens.CredentialSessionService,
    );
    this.synchronizeContainerRegistrations();
    return this;
  }

  usePlugins(plugins: ReadonlyArray<CodemationPlugin>): this {
    this.plugins = [...plugins];
    return this;
  }

  getRuntimeConfig(): CodemationApplicationRuntimeConfig {
    return { ...this.runtimeConfig };
  }

  getContainer(): Container {
    return this.container;
  }

  /**
   * Wires persistence, Prisma, buses, and domain services (no HTTP/WebSocket presentation).
   * Use with {@link useConfig} for CLI/admin tools that dispatch commands via {@link getCommandBus}.
   */
  async prepareCliPersistenceAndCommands(
    args: Readonly<{
      repoRoot: string;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): Promise<void> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareImplementationRegistrations(args.repoRoot, effectiveEnv);
    // Same port/bind tokens as prepareFrontendServerContainer so WorkflowWebsocketServer / relay can be
    // resolved during stopFrontendServerContainer without starting presentation servers.
    this.container.registerInstance(ApplicationTokens.WebSocketPort, this.resolveWebSocketPort(effectiveEnv));
    this.container.registerInstance(
      ApplicationTokens.WebSocketBindHost,
      effectiveEnv.CODEMATION_WS_BIND_HOST ?? "0.0.0.0",
    );
  }

  getCommandBus(): CommandBus {
    return this.container.resolve(ApplicationTokens.CommandBus);
  }

  getQueryBus(): QueryBus {
    return this.container.resolve(ApplicationTokens.QueryBus);
  }

  getWorkflows(): ReadonlyArray<WorkflowDefinition> {
    return [...this.workflows];
  }

  useSharedWorkflowWebsocketServer(workflowWebsocketServer: WorkflowWebsocketServer): this {
    this.sharedWorkflowWebsocketServer = workflowWebsocketServer;
    this.container.registerInstance(WorkflowWebsocketServer, workflowWebsocketServer);
    this.container.registerInstance(ApplicationTokens.WorkflowWebsocketPublisher, workflowWebsocketServer);
    return this;
  }

  registerCredentialType(type: RegisteredCredentialType): void {
    this.container.resolve(CredentialTypeRegistryImpl).register(type);
  }

  async applyPlugins(
    args: Readonly<{
      consumerRoot: string;
      repoRoot: string;
      env?: Readonly<Record<string, string | undefined>>;
      workflowSources?: ReadonlyArray<string>;
    }>,
  ): Promise<void> {
    await this.pluginRegistrar.apply({
      plugins: this.plugins,
      application: this,
      container: this.container,
      loggerFactory: this.container.resolve(ApplicationTokens.LoggerFactory),
      consumerRoot: args.consumerRoot,
      repoRoot: args.repoRoot,
      env: args.env ?? process.env,
      workflowSources: args.workflowSources ?? [],
    });
  }

  async applyBootHook(
    args: Readonly<{
      bootHookToken: CodemationConfig["bootHook"];
      consumerRoot: string;
      repoRoot: string;
      env?: Readonly<Record<string, string | undefined>>;
      workflowSources?: ReadonlyArray<string>;
    }>,
  ): Promise<void> {
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

  async prepareFrontendServerContainer(
    args: Readonly<{
      repoRoot: string;
      env?: Readonly<NodeJS.ProcessEnv>;
      /**
       * When true, skips starting the workflow WebSocket server and run-event relay.
       * Used when API execution lives in another process (e.g. `runtime-dev`) and this container
       * only needs session verification and persistence wiring (e.g. Next.js auth shell).
       */
      skipPresentationServers?: boolean;
    }>,
  ): Promise<void> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareImplementationRegistrations(args.repoRoot, effectiveEnv);
    this.container.registerInstance(ApplicationTokens.WebSocketPort, this.resolveWebSocketPort(effectiveEnv));
    this.container.registerInstance(
      ApplicationTokens.WebSocketBindHost,
      effectiveEnv.CODEMATION_WS_BIND_HOST ?? "0.0.0.0",
    );
    this.registerSessionVerification(effectiveEnv);
    this.registerWebhookRuntimeHost();
    if (args.skipPresentationServers !== true) {
      await this.startPresentationServers();
    }
  }

  private registerSessionVerification(effectiveEnv: Readonly<NodeJS.ProcessEnv>): void {
    const isProduction = effectiveEnv.NODE_ENV === "production";
    if (isProduction && !this.applicationAuthConfig) {
      throw new Error("CodemationConfig.auth is required when NODE_ENV is production.");
    }
    if (isProduction && this.applicationAuthConfig?.allowUnauthenticatedInDevelopment === true) {
      throw new Error(
        "CodemationAuthConfig.allowUnauthenticatedInDevelopment is not allowed when NODE_ENV is production.",
      );
    }
    const bypassAllowed = !isProduction && this.applicationAuthConfig?.allowUnauthenticatedInDevelopment === true;
    if (bypassAllowed) {
      this.container.register(ApplicationTokens.SessionVerifier, {
        useValue: new DevelopmentSessionBypassVerifier(),
      });
      return;
    }
    const secret = effectiveEnv.AUTH_SECRET ?? "";
    if (!secret) {
      throw new Error(
        "AUTH_SECRET is required unless CodemationAuthConfig.allowUnauthenticatedInDevelopment is enabled in a non-production environment.",
      );
    }
    this.container.register(ApplicationTokens.SessionVerifier, {
      useValue: new AuthJsSessionVerifier(secret),
    });
  }

  async startWorkerRuntime(
    args: Readonly<{
      repoRoot: string;
      env?: Readonly<NodeJS.ProcessEnv>;
      queues: ReadonlyArray<string>;
      bootstrapSource?: string | null;
      workflowSources?: ReadonlyArray<string>;
    }>,
  ): Promise<CodemationStopHandle> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareImplementationRegistrations(args.repoRoot, effectiveEnv);
    this.registerWebhookRuntimeHost();
    if (!this.container.isRegistered(ApplicationTokens.WorkerRuntimeScheduler, true)) {
      throw new Error("Worker mode requires a BullMQ scheduler backed by a Redis event bus.");
    }
    const workflows = this.container.resolve(CoreTokens.WorkflowRepository).list();
    const engine = this.container.resolve(Engine);
    await engine.start([...workflows]);
    const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow] as const));
    const scheduler = this.container.resolve(ApplicationTokens.WorkerRuntimeScheduler);
    const executionLimitsPolicy = this.container.resolve(CoreTokens.EngineExecutionLimitsPolicy);
    const worker = scheduler.createWorker({
      queues: args.queues,
      workflowsById,
      nodeResolver: this.container.resolve(CoreTokens.NodeResolver),
      credentialSessions: this.container.resolve(CoreTokens.CredentialSessionService),
      runStore: this.container.resolve(CoreTokens.RunStateStore),
      continuation: engine,
      binaryStorage: this.container.resolve(CoreTokens.BinaryStorage),
      workflows: this.container.resolve(CoreTokens.WorkflowRunnerService),
      rootExecutionOptionsFactory: new RootExecutionOptionsFactory(executionLimitsPolicy),
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

  async stopFrontendServerContainer(args?: Readonly<{ stopWebsocketServer?: boolean }>): Promise<void> {
    if (this.container.isRegistered(Engine, true)) {
      await this.container.resolve(Engine).stop();
    }
    if (this.container.isRegistered(WorkflowRunEventWebsocketRelay, true)) {
      await this.container.resolve(WorkflowRunEventWebsocketRelay).stop();
    }
    if (args?.stopWebsocketServer !== false && this.container.isRegistered(WorkflowWebsocketServer, true)) {
      await this.container.resolve(WorkflowWebsocketServer).stop();
    }
    if (this.ownedPrismaClient) {
      await this.ownedPrismaClient.$disconnect();
      this.ownedPrismaClient = null;
    }
  }

  private registerWebhookRuntimeHost(): void {
    this.container.registerInstance(CoreTokens.WebhookBasePath, ApiPaths.webhooks());
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
    this.container.register(CredentialTypeRegistryImpl, {
      useFactory: instanceCachingFactory(() => new CredentialTypeRegistryImpl()),
    });
    this.container.register(CoreTokens.CredentialTypeRegistry, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CredentialTypeRegistryImpl),
      ),
    });
    this.container.registerInstance(CoreTokens.CredentialSessionService, new UnavailableCredentialSessionService());
    this.container.register(CodemationIdFactory, { useClass: CodemationIdFactory });
    this.container.register(CoreTokens.RunIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    this.container.register(CoreTokens.ActivationIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    this.container.register(CoreTokens.WorkflowCatalog, {
      useFactory: instanceCachingFactory(
        () =>
          new LiveWorkflowCatalog(new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory())),
      ),
    });
    this.container.register(CoreTokens.WorkflowRegistry, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CoreTokens.WorkflowCatalog),
      ),
    });
    this.container.register(CoreTokens.WorkflowRepository, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CoreTokens.WorkflowCatalog),
      ),
    });
    this.container.register(CoreTokens.NodeResolver, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => new ContainerNodeResolver(dependencyContainer.resolve(CoreTokens.ServiceContainer)),
      ),
    });
    this.container.register(CoreTokens.WorkflowRunnerResolver, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          new ContainerWorkflowRunnerResolver(dependencyContainer.resolve(CoreTokens.ServiceContainer)),
      ),
    });
    this.container.register(EngineFactory, { useClass: EngineFactory });
    this.container.register(CoreTokens.EngineExecutionLimitsPolicy, {
      useFactory: instanceCachingFactory(() =>
        new EngineExecutionLimitsPolicyFactory().create(this.runtimeConfig.engineExecutionLimits),
      ),
    });
    this.container.register(Engine, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const workflowCatalog = dependencyContainer.resolve(CoreTokens.WorkflowCatalog);
        const nodeResolver = dependencyContainer.resolve(CoreTokens.NodeResolver);
        const tokenRegistryLike = dependencyContainer.resolve(CoreTokens.PersistedWorkflowTokenRegistry);
        const webhookTriggerMatcher = new WorkflowCatalogWebhookTriggerMatcher(
          dependencyContainer.resolve(CoreTokens.WorkflowRepository),
          {
            warn: (message) =>
              dependencyContainer.resolve(ServerLoggerFactory).create("codemation.webhooks.routing").warn(message),
          },
        );
        const workflowNodeInstanceFactory = new NodeInstanceFactory(nodeResolver);
        return dependencyContainer.resolve(EngineFactory).create({
          credentialSessions: dependencyContainer.resolve(CoreTokens.CredentialSessionService),
          workflowRunnerResolver: dependencyContainer.resolve(CoreTokens.WorkflowRunnerResolver),
          workflowCatalog,
          workflowRepository: dependencyContainer.resolve(CoreTokens.WorkflowRepository),
          nodeResolver,
          triggerSetupStateStore: dependencyContainer.resolve(CoreTokens.TriggerSetupStateStore),
          webhookTriggerMatcher,
          runIdFactory: dependencyContainer.resolve(CoreTokens.RunIdFactory),
          activationIdFactory: dependencyContainer.resolve(CoreTokens.ActivationIdFactory),
          runStore: dependencyContainer.resolve(CoreTokens.RunStateStore),
          activationScheduler: dependencyContainer.resolve(CoreTokens.NodeActivationScheduler),
          runDataFactory: dependencyContainer.resolve(CoreTokens.RunDataFactory),
          executionContextFactory: dependencyContainer.resolve(CoreTokens.ExecutionContextFactory),
          eventBus: dependencyContainer.resolve(CoreTokens.RunEventBus),
          tokenRegistry: tokenRegistryLike,
          workflowNodeInstanceFactory,
          executionLimitsPolicy: dependencyContainer.resolve(CoreTokens.EngineExecutionLimitsPolicy),
        });
      }),
    });
    this.container.register(RunIntentService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new RunIntentService(
          dependencyContainer.resolve(Engine),
          dependencyContainer.resolve(CoreTokens.WorkflowRepository),
        );
      }),
    });
    this.container.registerInstance(LogLevelPolicyFactory, logLevelPolicyFactory);
    this.container.register(ServerLoggerFactory, { useClass: ServerLoggerFactory });
    this.container.register(ApplicationTokens.LoggerFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(ServerLoggerFactory)),
    });
    this.container.register(ApplicationTokens.PerformanceDiagnosticsLogger, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return dependencyContainer.resolve(ServerLoggerFactory).createPerformanceDiagnostics("codemation.performance");
      }),
    });
    this.container.register(WorkflowWebsocketServer, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        if (this.sharedWorkflowWebsocketServer) {
          return this.sharedWorkflowWebsocketServer;
        }
        return new WorkflowWebsocketServer(
          dependencyContainer.resolve(ApplicationTokens.WebSocketPort),
          dependencyContainer.resolve(ApplicationTokens.WebSocketBindHost),
          dependencyContainer.resolve(ServerLoggerFactory).create("codemation-websocket.server"),
        );
      }),
    });
    this.container.register(CoreTokens.WorkflowRunnerService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return new EngineWorkflowRunnerService(
          dependencyContainer.resolve(Engine),
          dependencyContainer.resolve(CoreTokens.WorkflowRepository),
        );
      }),
    });
    this.container.register(PrismaClientFactory, { useClass: PrismaClientFactory });
    this.container.register(PrismaMigrationDeployer, { useClass: PrismaMigrationDeployer });
    this.container.register(WorkflowPolicyUiPresentationFactory, { useClass: WorkflowPolicyUiPresentationFactory });
    this.container.register(WorkflowDefinitionMapper, { useClass: WorkflowDefinitionMapper });
    this.container.register(RequestToWebhookItemMapper, { useClass: RequestToWebhookItemMapper });
    this.container.register(WebhookEndpointPathValidator, { useClass: WebhookEndpointPathValidator });
    this.container.register(CredentialSecretCipher, { useClass: CredentialSecretCipher });
    this.container.register(CredentialMaterialResolver, { useClass: CredentialMaterialResolver });
    this.container.register(CredentialFieldEnvOverlayService, { useClass: CredentialFieldEnvOverlayService });
    this.container.register(CredentialRuntimeMaterialService, { useClass: CredentialRuntimeMaterialService });
    this.container.register(WorkflowCredentialNodeResolver, { useClass: WorkflowCredentialNodeResolver });
    this.container.register(CredentialInstanceService, { useClass: CredentialInstanceService });
    this.container.register(CredentialBindingService, { useClass: CredentialBindingService });
    this.container.register(CredentialTestService, { useClass: CredentialTestService });
    this.container.register(CredentialSessionServiceImpl, { useClass: CredentialSessionServiceImpl });
    this.container.register(OAuth2ProviderRegistry, { useClass: OAuth2ProviderRegistry });
    this.container.register(OAuth2ConnectService, { useClass: OAuth2ConnectService });
  }

  private registerRepositoriesAndBuses(): void {
    this.container.register(WorkflowDefinitionRepositoryAdapter, { useClass: WorkflowDefinitionRepositoryAdapter });
    this.container.register(InMemoryWorkflowRunRepository, { useClass: InMemoryWorkflowRunRepository });
    this.container.register(InMemoryTriggerSetupStateStore, { useClass: InMemoryTriggerSetupStateStore });
    this.container.register(InMemoryCredentialStore, { useClass: InMemoryCredentialStore });
    this.container.register(SqlWorkflowRunRepository, { useClass: SqlWorkflowRunRepository });
    this.container.register(InMemoryWorkflowDebuggerOverlayRepository, {
      useClass: InMemoryWorkflowDebuggerOverlayRepository,
    });
    this.container.register(PrismaTriggerSetupStateStore, { useClass: PrismaTriggerSetupStateStore });
    this.container.register(PrismaWorkflowDebuggerOverlayRepository, {
      useClass: PrismaWorkflowDebuggerOverlayRepository,
    });
    this.container.register(PrismaCredentialStore, { useClass: PrismaCredentialStore });
    this.container.register(ApplicationTokens.WorkflowDefinitionRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          dependencyContainer.resolve(WorkflowDefinitionRepositoryAdapter) as unknown as WorkflowDefinitionRepository,
      ),
    });
    this.container.register(ApplicationTokens.WorkflowRunRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          dependencyContainer.resolve(SqlWorkflowRunRepository) as unknown as WorkflowRunRepository,
      ),
    });
    this.container.register(ApplicationTokens.WorkflowDebuggerOverlayRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          dependencyContainer.resolve(
            InMemoryWorkflowDebuggerOverlayRepository,
          ) as unknown as WorkflowDebuggerOverlayRepository,
      ),
    });
    this.container.register(ApplicationTokens.CredentialStore, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryCredentialStore)),
    });
    this.container.register(InMemoryQueryBus, { useClass: InMemoryQueryBus });
    this.container.register(InMemoryCommandBus, { useClass: InMemoryCommandBus });
    this.container.register(InMemoryDomainEventBus, { useClass: InMemoryDomainEventBus });
    this.container.register(ApplicationTokens.QueryBus, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => dependencyContainer.resolve(InMemoryQueryBus) as unknown as QueryBus,
      ),
    });
    this.container.register(ApplicationTokens.CommandBus, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => dependencyContainer.resolve(InMemoryCommandBus) as unknown as CommandBus,
      ),
    });
    this.container.register(ApplicationTokens.DomainEventBus, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => dependencyContainer.resolve(InMemoryDomainEventBus) as unknown as DomainEventBus,
      ),
    });
  }

  private registerApplicationServicesAndRoutes(): void {
    this.container.register(CodemationHonoApiApp, {
      useClass: CodemationHonoApiApp,
    });
  }

  private registerOperationalInfrastructure(): void {
    this.container.register(ApplicationTokens.WorkflowWebsocketPublisher, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(WorkflowWebsocketServer)),
    });
    this.container.register(WorkflowRunEventWebsocketRelay, { useClass: WorkflowRunEventWebsocketRelay });
  }

  private synchronizeWorkflowRegistry(): void {
    const workflowCatalog = this.container.resolve(CoreTokens.WorkflowCatalog);
    workflowCatalog.setWorkflows(this.workflows);
    if (this.container.isRegistered(WebhookEndpointPathValidator, true)) {
      this.container.resolve(WebhookEndpointPathValidator).validateAndWarn(this.workflows);
    }
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
    const binaryStorage = this.createBinaryStorage(repoRoot);

    this.container.registerInstance(CoreTokens.RunEventBus, eventBus);
    this.container.registerInstance(CoreTokens.RunStateStore, persistence.runStore);
    this.container.registerInstance(CoreTokens.TriggerSetupStateStore, persistence.triggerSetupStateStore);
    this.container.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
    this.container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
    this.container.registerInstance(CoreTokens.BinaryStorage, binaryStorage);
    this.container.registerInstance(
      CoreTokens.ExecutionContextFactory,
      new DefaultExecutionContextFactory(binaryStorage),
    );
    this.container.registerInstance(ApplicationTokens.ProcessEnv, env);
    this.container.registerInstance(ApplicationTokens.Clock, new SystemClock());
    this.container.registerInstance(ApplicationTokens.CodemationAuthConfig, this.applicationAuthConfig);
    this.container.register(UserAccountService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const prismaClient = dependencyContainer.isRegistered(PrismaClient, true)
          ? dependencyContainer.resolve(PrismaClient)
          : undefined;
        return new UserAccountService(
          dependencyContainer.resolve(ApplicationTokens.CodemationAuthConfig),
          prismaClient,
        );
      }),
    });
    this.container.registerInstance(
      ApplicationTokens.WorkflowDebuggerOverlayRepository,
      persistence.workflowDebuggerOverlayRepository,
    );
    if (persistence.workflowRunRepository) {
      this.container.registerInstance(ApplicationTokens.WorkflowRunRepository, persistence.workflowRunRepository);
    }
    if (persistence.prismaClient) {
      this.container.registerInstance(PrismaClient, persistence.prismaClient);
    }
    if (resolved.databaseUrl) {
      this.container.registerInstance(ApplicationTokens.CredentialStore, this.container.resolve(PrismaCredentialStore));
    } else {
      this.container.registerInstance(
        ApplicationTokens.CredentialStore,
        this.container.resolve(InMemoryCredentialStore),
      );
    }
    if (!this.hasConfigCredentialSessionServiceBinding) {
      this.container.register(CoreTokens.CredentialSessionService, {
        useFactory: instanceCachingFactory((dependencyContainer) =>
          dependencyContainer.resolve(CredentialSessionServiceImpl),
        ),
      });
    }
    if (resolved.workerRuntimeScheduler) {
      this.container.registerInstance(ApplicationTokens.WorkerRuntimeScheduler, resolved.workerRuntimeScheduler);
    }
    this.synchronizeWorkflowRegistry();
  }

  private async applyDatabaseMigrations(
    resolved: ResolvedImplementationSelection,
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    if (
      !resolved.databaseUrl ||
      this.hasProvidedPrismaClientOverride() ||
      env.CODEMATION_SKIP_STARTUP_MIGRATIONS === "true"
    ) {
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
  ): Readonly<{
    runStore: RunStateStore;
    triggerSetupStateStore: TriggerSetupStateStore;
    workflowRunRepository?: WorkflowRunRepository;
    workflowDebuggerOverlayRepository: WorkflowDebuggerOverlayRepository;
    prismaClient?: PrismaClient;
  }> {
    if (!resolved.databaseUrl) {
      const workflowRunRepository = this.container.resolve(InMemoryWorkflowRunRepository);
      return {
        workflowRunRepository,
        triggerSetupStateStore: this.container.resolve(InMemoryTriggerSetupStateStore),
        workflowDebuggerOverlayRepository: this.container.resolve(InMemoryWorkflowDebuggerOverlayRepository),
        runStore: new PublishingRunStateStore(workflowRunRepository, eventBus),
      };
    }
    const prismaClientResolution = this.resolveInjectedOrOwnedPrismaClient(resolved.databaseUrl);
    const childContainer = this.container.createChildContainer();
    childContainer.registerInstance(PrismaClient, prismaClientResolution.prismaClient);
    const workflowRunRepository = childContainer.resolve(PrismaWorkflowRunRepository);
    const triggerSetupStateStore = childContainer.resolve(PrismaTriggerSetupStateStore);
    const workflowDebuggerOverlayRepository = childContainer.resolve(PrismaWorkflowDebuggerOverlayRepository);
    return {
      prismaClient: prismaClientResolution.ownedPrismaClient,
      workflowRunRepository,
      triggerSetupStateStore,
      workflowDebuggerOverlayRepository,
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
    const nodeResolver = this.container.resolve(CoreTokens.NodeResolver);
    if (resolved.workerRuntimeScheduler) {
      return new DefaultDrivingScheduler(
        new ConfigDrivenOffloadPolicy(),
        resolved.workerRuntimeScheduler,
        new InlineDrivingScheduler(nodeResolver),
      );
    }
    return new InlineDrivingScheduler(nodeResolver);
  }

  private createBinaryStorage(repoRoot: string) {
    if (!repoRoot) {
      return new InMemoryBinaryStorage();
    }
    return new LocalFilesystemBinaryStorage(path.join(repoRoot, ".codemation", "binary"));
  }

  private resolveImplementationSelection(
    args: Readonly<{
      repoRoot: string;
      runtimeConfig: CodemationApplicationRuntimeConfig;
      env: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): ResolvedImplementationSelection {
    void args.repoRoot;
    const databaseUrl = this.resolveDatabaseUrl(args.runtimeConfig, args.env);
    const databaseKind = databaseUrl ? this.resolveDatabaseKind(args.runtimeConfig) : undefined;
    const redisUrl = args.runtimeConfig.eventBus?.redisUrl ?? args.env.REDIS_URL;
    const schedulerKind = this.resolveSchedulerKind(args.runtimeConfig, args.env, redisUrl);
    const eventBusKind = this.resolveEventBusKind(args.runtimeConfig, args.env, schedulerKind, redisUrl);
    const queuePrefix =
      args.runtimeConfig.scheduler?.queuePrefix ??
      args.runtimeConfig.eventBus?.queuePrefix ??
      args.env.QUEUE_PREFIX ??
      "codemation";
    if (schedulerKind === "bullmq" && eventBusKind !== "redis") {
      throw new Error(
        "BullMQ scheduling requires a Redis event bus so worker events can be forwarded to connected clients.",
      );
    }
    if (eventBusKind === "redis" && !redisUrl) {
      throw new Error("Redis event bus requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
    const workerRuntimeScheduler =
      schedulerKind === "bullmq"
        ? new BullmqScheduler({ url: this.requireRedisUrl(redisUrl) }, queuePrefix)
        : undefined;
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

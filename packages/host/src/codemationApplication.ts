import type { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import "reflect-metadata";

import type {
  Container,
  RunEventBus,
  TriggerSetupStateRepository,
  WorkflowExecutionRepository,
  WorkflowDefinition,
} from "@codemation/core";
import {
  CoreTokens,
  EventPublishingWorkflowExecutionRepository,
  InMemoryRunEventBus,
  instanceCachingFactory,
  SystemClock,
  container as tsyringeContainer,
} from "@codemation/core";
import {
  ConfigDrivenOffloadPolicy,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  Engine,
  EngineRuntimeRegistrar,
  InlineDrivingScheduler,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
  PersistedWorkflowTokenRegistry,
  WorkflowRepositoryWebhookTriggerMatcher,
} from "@codemation/core/bootstrap";
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
import "./application/commands/SetWorkflowActivationCommandHandler";
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
import { BootRuntimeSnapshotHolder } from "./application/dev/BootRuntimeSnapshotHolder";
import { DevBootstrapSummaryAssembler } from "./application/dev/DevBootstrapSummaryAssembler";
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
  type CredentialType,
} from "./domain/credentials/CredentialServices";
import { OAuth2ConnectService } from "./domain/credentials/OAuth2ConnectServiceFactory";
import { OAuth2ProviderRegistry } from "./domain/credentials/OAuth2ProviderRegistry";
import { WorkflowRunRepository } from "./domain/runs/WorkflowRunRepository";
import { UserAccountService } from "./domain/users/UserAccountServiceRegistry";
import { WorkflowDebuggerOverlayRepository } from "./domain/workflows/WorkflowDebuggerOverlayRepository";
import { WorkflowDefinitionRepository } from "./domain/workflows/WorkflowDefinitionRepository";
import { WorkflowActivationPreflight } from "./domain/workflows/WorkflowActivationPreflight";
import { WorkflowActivationPreflightRules } from "./domain/workflows/WorkflowActivationPreflightRules";
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
import type { BootRuntimeSummary } from "./application/dev/BootRuntimeSummary.types";
import { LogLevelPolicyFactory, logLevelPolicyFactory } from "./infrastructure/logging/LogLevelPolicyFactory";
import { ServerLoggerFactory } from "./infrastructure/logging/ServerLoggerFactory";
import {
  InMemoryCredentialStore,
  PrismaCredentialStore,
} from "./infrastructure/persistence/CredentialPersistenceStore";
import { PrismaClient } from "./infrastructure/persistence/generated/prisma-client/client.js";
import { InMemoryTriggerSetupStateRepository } from "./infrastructure/persistence/InMemoryTriggerSetupStateRepository";
import { InMemoryWorkflowDebuggerOverlayRepository } from "./infrastructure/persistence/InMemoryWorkflowDebuggerOverlayRepository";
import { InMemoryWorkflowActivationRepository } from "./infrastructure/persistence/InMemoryWorkflowActivationRepository";
import { InMemoryWorkflowRunRepository } from "./infrastructure/persistence/InMemoryWorkflowRunRepository";
import type { ResolvedDatabasePersistence } from "./infrastructure/persistence/DatabasePersistenceResolver";
import { DatabasePersistenceResolver } from "./infrastructure/persistence/DatabasePersistenceResolver";
import { SchedulerPersistenceCompatibilityValidator } from "./infrastructure/persistence/SchedulerPersistenceCompatibilityValidator";
import { PrismaClientFactory } from "./infrastructure/persistence/PrismaClientFactory";
import { PrismaMigrationDeployer } from "./infrastructure/persistence/PrismaMigrationDeployer";
import { PrismaTriggerSetupStateRepository } from "./infrastructure/persistence/PrismaTriggerSetupStateRepository";
import { PrismaWorkflowActivationRepository } from "./infrastructure/persistence/PrismaWorkflowActivationRepository";
import { PrismaWorkflowDebuggerOverlayRepository } from "./infrastructure/persistence/PrismaWorkflowDebuggerOverlayRepository";
import { PrismaWorkflowRunRepository } from "./infrastructure/persistence/PrismaWorkflowRunRepository";
import { RuntimeWorkflowActivationPolicy } from "./infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { WorkflowDefinitionRepositoryAdapter } from "./infrastructure/persistence/WorkflowDefinitionRepositoryAdapter";
import { LiveWorkflowRepository } from "./infrastructure/runtime/LiveWorkflowRepository";
import { WorkflowRunRepository as SqlWorkflowRunRepository } from "./infrastructure/persistence/WorkflowRunRepository";
import type { WorkerRuntimeScheduler } from "./infrastructure/runtime/WorkerRuntimeScheduler";
import { RequestToWebhookItemMapper } from "./infrastructure/webhooks/RequestToWebhookItemMapper";
import type { CodemationAuthConfig } from "./presentation/config/CodemationAuthConfig";
import type { CodemationBinding } from "./presentation/config/CodemationBinding";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationConfig,
  CodemationEventBusKind,
  CodemationSchedulerKind,
} from "./presentation/config/CodemationConfig";
import type { CodemationWhitelabelConfig } from "./presentation/config/CodemationWhitelabelConfig";
import type { CodemationPlugin } from "./presentation/config/CodemationPlugin";
import { ApiPaths } from "./presentation/http/ApiPaths";
import { DevBootstrapSummaryHttpRouteHandler } from "./presentation/http/routeHandlers/DevBootstrapSummaryHttpRouteHandler";
import { WhitelabelLogoHttpRouteHandler } from "./presentation/http/routeHandlers/WhitelabelLogoHttpRouteHandler";
import { CodemationHonoApiApp } from "./presentation/http/hono/CodemationHonoApiAppFactory";
import "./presentation/http/hono/registrars/DevHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/BinaryHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/CredentialHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/OAuth2HonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/RunHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/UserHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/WebhookHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/WhitelabelHonoApiRouteRegistrar";
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
  private ownedPglite: PGlite | null = null;
  private readonly databasePersistenceResolver = new DatabasePersistenceResolver();
  private readonly schedulerPersistenceCompatibilityValidator = new SchedulerPersistenceCompatibilityValidator();
  private bootRuntimeSummary: BootRuntimeSummary | null = null;
  private runtimeConfig: CodemationApplicationRuntimeConfig = {};
  private bindings: ReadonlyArray<CodemationBinding<unknown>> = [];
  private hasConfigCredentialSessionServiceBinding = false;
  private plugins: ReadonlyArray<CodemationPlugin> = [];
  private sharedWorkflowWebsocketServer: WorkflowWebsocketServer | null = null;
  private applicationAuthConfig: CodemationAuthConfig | undefined;
  private whitelabelConfig: CodemationWhitelabelConfig = {};
  private frameworkBuiltinCredentialTypesRegistered = false;

  constructor() {
    this.synchronizeContainerRegistrations();
  }

  useConfig(config: CodemationApplicationConfig): this {
    logLevelPolicyFactory.create().applyCodemationLogConfig(config.log);
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
    this.whitelabelConfig = config.whitelabel ?? {};
    return this;
  }

  useContainer(container: Container): this {
    this.container = container;
    this.synchronizeContainerRegistrations();
    return this;
  }

  useWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): this {
    this.workflows = [...workflows];
    this.synchronizeLiveWorkflowRepository();
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
      consumerRoot: string;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): Promise<void> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareImplementationRegistrations(args.repoRoot, args.consumerRoot, effectiveEnv);
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

  registerCredentialType(type: CredentialType<any, any, unknown>): void {
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
      consumerRoot: string;
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
    await this.prepareImplementationRegistrations(args.repoRoot, args.consumerRoot, effectiveEnv);
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
      consumerRoot: string;
      env?: Readonly<NodeJS.ProcessEnv>;
      queues: ReadonlyArray<string>;
      bootstrapSource?: string | null;
      workflowSources?: ReadonlyArray<string>;
    }>,
  ): Promise<CodemationStopHandle> {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    await this.prepareImplementationRegistrations(args.repoRoot, args.consumerRoot, effectiveEnv);
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
      workflowExecutionRepository: this.container.resolve(CoreTokens.WorkflowExecutionRepository),
      continuation: engine,
      binaryStorage: this.container.resolve(CoreTokens.BinaryStorage),
      workflows: this.container.resolve(CoreTokens.WorkflowRunnerService),
      executionLimitsPolicy,
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
    if (this.ownedPglite) {
      await this.ownedPglite.close();
      this.ownedPglite = null;
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
    this.synchronizeLiveWorkflowRepository();
  }

  private registerConfiguredBindings(): void {
    if (this.bindings.length === 0) {
      return;
    }
    this.configBindingRegistrar.apply(this.container, this.bindings);
  }

  private registerCoreInfrastructure(): void {
    this.container.registerInstance(BootRuntimeSnapshotHolder, new BootRuntimeSnapshotHolder());
    this.container.registerInstance(CodemationApplication, this);
    this.container.registerInstance(CoreTokens.PersistedWorkflowTokenRegistry, new PersistedWorkflowTokenRegistry());
    this.container.register(CredentialTypeRegistryImpl, {
      useFactory: instanceCachingFactory(() => new CredentialTypeRegistryImpl()),
    });
    this.container.register(CoreTokens.CredentialTypeRegistry, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CredentialTypeRegistryImpl),
      ),
    });
    this.container.register(CodemationIdFactory, { useClass: CodemationIdFactory });
    this.container.register(CoreTokens.RunIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    this.container.register(CoreTokens.ActivationIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    this.container.register(CoreTokens.LiveWorkflowRepository, {
      useFactory: instanceCachingFactory(
        () =>
          new LiveWorkflowRepository(
            new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory()),
          ),
      ),
    });
    this.container.register(CoreTokens.WorkflowRepository, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CoreTokens.LiveWorkflowRepository),
      ),
    });
    this.container.registerInstance(CoreTokens.NodeResolver, this.container);
    const runtimeWorkflowActivationPolicy = new RuntimeWorkflowActivationPolicy();
    this.container.registerInstance(RuntimeWorkflowActivationPolicy, runtimeWorkflowActivationPolicy);
    this.container.registerInstance(CoreTokens.WorkflowActivationPolicy, runtimeWorkflowActivationPolicy);
    new EngineRuntimeRegistrar().register(this.container, {
      resolveEngineExecutionLimits: () => this.runtimeConfig.engineExecutionLimits,
      webhookTriggerMatcherProvider: {
        createMatcher: (dependencyContainer) => {
          const serverLoggerFactory = dependencyContainer.resolve(ServerLoggerFactory);
          const webhookRoutingLogger = serverLoggerFactory.create("codemation.webhooks.routing");
          return new WorkflowRepositoryWebhookTriggerMatcher(
            dependencyContainer.resolve(CoreTokens.WorkflowRepository),
            dependencyContainer.resolve(CoreTokens.WorkflowActivationPolicy),
            {
              warn: (message) => webhookRoutingLogger.warn(message),
              info: (message) => webhookRoutingLogger.debug(message),
            },
          );
        },
      },
      triggerRuntimeDiagnosticsProvider: {
        create: (dependencyContainer) => {
          const triggerRuntimeLogger = dependencyContainer
            .resolve(ServerLoggerFactory)
            .create("codemation.engine.triggers");
          return {
            info: (message) => triggerRuntimeLogger.debug(message),
            warn: (message) => triggerRuntimeLogger.warn(message),
          };
        },
      },
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
    this.container.register(WorkflowActivationPreflightRules, { useClass: WorkflowActivationPreflightRules });
    this.container.register(WorkflowActivationPreflight, { useClass: WorkflowActivationPreflight });
    this.container.register(CredentialTestService, { useClass: CredentialTestService });
    this.container.register(CredentialSessionServiceImpl, { useClass: CredentialSessionServiceImpl });
    this.container.register(OAuth2ProviderRegistry, { useClass: OAuth2ProviderRegistry });
    this.container.register(OAuth2ConnectService, { useClass: OAuth2ConnectService });
  }

  private registerRepositoriesAndBuses(): void {
    this.container.register(WorkflowDefinitionRepositoryAdapter, { useClass: WorkflowDefinitionRepositoryAdapter });
    this.container.register(InMemoryWorkflowRunRepository, { useClass: InMemoryWorkflowRunRepository });
    this.container.register(InMemoryTriggerSetupStateRepository, { useClass: InMemoryTriggerSetupStateRepository });
    this.container.register(InMemoryCredentialStore, { useClass: InMemoryCredentialStore });
    this.container.register(SqlWorkflowRunRepository, { useClass: SqlWorkflowRunRepository });
    this.container.register(InMemoryWorkflowDebuggerOverlayRepository, {
      useClass: InMemoryWorkflowDebuggerOverlayRepository,
    });
    this.container.register(PrismaTriggerSetupStateRepository, { useClass: PrismaTriggerSetupStateRepository });
    this.container.register(PrismaWorkflowDebuggerOverlayRepository, {
      useClass: PrismaWorkflowDebuggerOverlayRepository,
    });
    this.container.register(PrismaWorkflowActivationRepository, { useClass: PrismaWorkflowActivationRepository });
    this.container.register(InMemoryWorkflowActivationRepository, { useClass: InMemoryWorkflowActivationRepository });
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
    this.container.register(DevBootstrapSummaryAssembler, { useClass: DevBootstrapSummaryAssembler });
    this.container.register(DevBootstrapSummaryHttpRouteHandler, { useClass: DevBootstrapSummaryHttpRouteHandler });
    this.container.register(WhitelabelLogoHttpRouteHandler, { useClass: WhitelabelLogoHttpRouteHandler });
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

  private synchronizeLiveWorkflowRepository(): void {
    const liveWorkflowRepository = this.container.resolve(CoreTokens.LiveWorkflowRepository);
    liveWorkflowRepository.setWorkflows(this.workflows);
    if (this.container.isRegistered(WebhookEndpointPathValidator, true)) {
      this.container.resolve(WebhookEndpointPathValidator).validateAndWarn(this.workflows);
    }
  }

  private async prepareImplementationRegistrations(
    repoRoot: string,
    consumerRoot: string,
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    const resolved = this.resolveImplementationSelection({
      repoRoot,
      consumerRoot,
      env,
      runtimeConfig: this.runtimeConfig,
    });
    this.bootRuntimeSummary = {
      databasePersistence: resolved.databasePersistence,
      eventBusKind: resolved.eventBusKind,
      queuePrefix: resolved.queuePrefix,
      schedulerKind: resolved.schedulerKind,
      redisUrl: resolved.redisUrl,
    };
    this.container.resolve(BootRuntimeSnapshotHolder).set(this.bootRuntimeSummary);
    await this.applyDatabaseMigrations(resolved, env);
    const eventBus = this.createRunEventBus(resolved);
    const persistence = await this.createRunPersistence(resolved, eventBus);
    const binaryStorage = this.createBinaryStorage(repoRoot);

    this.container.registerInstance(CoreTokens.RunEventBus, eventBus);
    this.container.registerInstance(CoreTokens.WorkflowExecutionRepository, persistence.workflowExecutionRepository);
    this.container.registerInstance(CoreTokens.TriggerSetupStateRepository, persistence.triggerSetupStateRepository);
    this.container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
    this.container.registerInstance(CoreTokens.BinaryStorage, binaryStorage);
    this.container.registerInstance(
      CoreTokens.ExecutionContextFactory,
      new DefaultExecutionContextFactory(binaryStorage),
    );
    this.container.registerInstance(ApplicationTokens.ProcessEnv, env);
    this.container.registerInstance(ApplicationTokens.Clock, new SystemClock());
    this.container.registerInstance(ApplicationTokens.CodemationAuthConfig, this.applicationAuthConfig);
    this.container.registerInstance(ApplicationTokens.CodemationWhitelabelConfig, this.whitelabelConfig);
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
    if (this.container.isRegistered(PrismaClient, true)) {
      this.container.registerInstance(ApplicationTokens.PrismaClient, this.container.resolve(PrismaClient));
    }
    const workflowActivationRepository = persistence.prismaClient
      ? this.container.resolve(PrismaWorkflowActivationRepository)
      : this.container.resolve(InMemoryWorkflowActivationRepository);
    this.container.registerInstance(ApplicationTokens.WorkflowActivationRepository, workflowActivationRepository);
    await this.container.resolve(RuntimeWorkflowActivationPolicy).hydrateFromRepository(workflowActivationRepository);
    if (resolved.databasePersistence.kind !== "none") {
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
    this.registerRuntimeNodeActivationScheduler();
    this.synchronizeLiveWorkflowRepository();
  }

  private async applyDatabaseMigrations(
    resolved: ResolvedImplementationSelection,
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    if (
      resolved.databasePersistence.kind === "none" ||
      this.hasProvidedPrismaClientOverride() ||
      env.CODEMATION_SKIP_STARTUP_MIGRATIONS === "true"
    ) {
      return;
    }
    await this.container.resolve(PrismaMigrationDeployer).deployPersistence(resolved.databasePersistence, env);
  }

  private createRunEventBus(resolved: ResolvedImplementationSelection): RunEventBus {
    if (resolved.eventBusKind === "redis") {
      return new RedisRunEventBus(this.requireRedisUrl(resolved.redisUrl), resolved.queuePrefix);
    }
    return new InMemoryRunEventBus();
  }

  private async createRunPersistence(
    resolved: ResolvedImplementationSelection,
    eventBus: RunEventBus,
  ): Promise<
    Readonly<{
      workflowExecutionRepository: WorkflowExecutionRepository;
      triggerSetupStateRepository: TriggerSetupStateRepository;
      workflowRunRepository?: WorkflowRunRepository;
      workflowDebuggerOverlayRepository: WorkflowDebuggerOverlayRepository;
      prismaClient?: PrismaClient;
    }>
  > {
    if (resolved.databasePersistence.kind === "none") {
      const workflowRunRepository = this.container.resolve(InMemoryWorkflowRunRepository);
      return {
        workflowRunRepository,
        triggerSetupStateRepository: this.container.resolve(InMemoryTriggerSetupStateRepository),
        workflowDebuggerOverlayRepository: this.container.resolve(InMemoryWorkflowDebuggerOverlayRepository),
        workflowExecutionRepository: new EventPublishingWorkflowExecutionRepository(workflowRunRepository, eventBus),
      };
    }
    const prismaClientResolution = await this.resolveInjectedOrOwnedPrismaClient(resolved.databasePersistence);
    const childContainer = this.container.createChildContainer();
    childContainer.registerInstance(PrismaClient, prismaClientResolution.prismaClient);
    const workflowRunRepository = childContainer.resolve(PrismaWorkflowRunRepository);
    const triggerSetupStateRepository = childContainer.resolve(PrismaTriggerSetupStateRepository);
    const workflowDebuggerOverlayRepository = childContainer.resolve(PrismaWorkflowDebuggerOverlayRepository);
    return {
      prismaClient: prismaClientResolution.ownedPrismaClient,
      workflowRunRepository,
      triggerSetupStateRepository,
      workflowDebuggerOverlayRepository,
      workflowExecutionRepository: new EventPublishingWorkflowExecutionRepository(workflowRunRepository, eventBus),
    };
  }

  private hasProvidedPrismaClientOverride(): boolean {
    return this.container.isRegistered(PrismaClient, true);
  }

  private async resolveInjectedOrOwnedPrismaClient(persistence: ResolvedDatabasePersistence): Promise<
    Readonly<{
      prismaClient: PrismaClient;
      ownedPrismaClient?: PrismaClient;
    }>
  > {
    if (this.hasProvidedPrismaClientOverride()) {
      return {
        prismaClient: this.container.resolve(PrismaClient),
      };
    }
    const factory = this.container.resolve(PrismaClientFactory);
    if (persistence.kind === "postgresql") {
      this.ownedPglite = null;
      const prismaClient = factory.createPostgres(persistence.databaseUrl);
      this.ownedPrismaClient = prismaClient;
      return {
        prismaClient,
        ownedPrismaClient: prismaClient,
      };
    }
    if (persistence.kind !== "pglite") {
      throw new Error("Unexpected database persistence mode for Prisma.");
    }
    const { prismaClient, pglite } = await factory.createPglite(persistence.dataDir);
    this.ownedPrismaClient = prismaClient;
    this.ownedPglite = pglite;
    return {
      prismaClient,
      ownedPrismaClient: prismaClient,
    };
  }

  private registerRuntimeNodeActivationScheduler(): void {
    this.container.register(CoreTokens.NodeActivationScheduler, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const inlineScheduler = dependencyContainer.resolve(InlineDrivingScheduler);
        if (!dependencyContainer.isRegistered(ApplicationTokens.WorkerRuntimeScheduler, true)) {
          return inlineScheduler;
        }
        return new DefaultDrivingScheduler(
          new ConfigDrivenOffloadPolicy(),
          dependencyContainer.resolve(ApplicationTokens.WorkerRuntimeScheduler),
          inlineScheduler,
        );
      }),
    });
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
      consumerRoot: string;
      runtimeConfig: CodemationApplicationRuntimeConfig;
      env: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): ResolvedImplementationSelection {
    void args.repoRoot;
    const databasePersistence = this.databasePersistenceResolver.resolve({
      runtimeConfig: args.runtimeConfig,
      env: args.env,
      consumerRoot: args.consumerRoot,
    });
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
    this.schedulerPersistenceCompatibilityValidator.validate({ schedulerKind, persistence: databasePersistence });
    const workerRuntimeScheduler =
      schedulerKind === "bullmq"
        ? new BullmqScheduler({ url: this.requireRedisUrl(redisUrl) }, queuePrefix)
        : undefined;
    return {
      databasePersistence,
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
  databasePersistence: ResolvedDatabasePersistence;
  eventBusKind: CodemationEventBusKind;
  queuePrefix: string;
  redisUrl?: string;
  schedulerKind: CodemationSchedulerKind;
  workerRuntimeScheduler?: WorkerRuntimeScheduler;
}>;
